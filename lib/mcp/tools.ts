// MCP tool registry for the Estalvify API.
//
// Every tool derives the acting user from the validated access token
// (extra.authInfo.extra.userId, set by the /api/mcp verifyToken bridge) and
// scopes all data access to that user — never trusting client-provided ids for
// ownership. Business logic is reused from lib/* where possible.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma";
import { buildUncategorizedWhere } from "@/lib/categorize";
import { bulkCategorizeForUser } from "@/lib/mcp/categorize";
import {
  createCategoryForUser,
  updateCategoryForUser,
  deleteCategoryForUser,
  resolveCategoryFilter,
  categoryCountsForUser,
  listRulesForUser,
  createRuleForUser,
  updateRuleForUser,
  runRuleForUser,
  runAllRulesForUser,
  listSeriesForUser,
  createSeriesForUser,
  updateSeriesForUser,
  deleteSeriesForUser,
  listPlannedItemsForUser,
  createPlannedItemForUser,
  updatePlannedItemForUser,
  deletePlannedItemForUser,
  upsertBudgetItemForUser,
  deleteBudgetItemForUser,
} from "@/lib/mcp/manage";
import {
  deleteRuleForUser,
  reorderRulesForUser,
  testConditions,
  undoRuleRun,
} from "@/lib/rules/apply";
import {
  parseConditions,
  assertValidConditionTree,
  MAX_CONDITION_VALUE_LENGTH,
} from "@/lib/rules/rule-dto";
import type { ConditionGroup } from "@/lib/rules/rule-dto";
import { send } from "@vercel/queue";
import { TOPICS, type SyncConnectionMessage } from "@/lib/queue";
import { hasScope, type KnownScope } from "@/lib/mcp/scopes";
import { buildMonthStatus } from "@/lib/budget/month-status";
import { getUserPrefs } from "@/lib/user-prefs";

// Rule conditions (see lib/rules/rule-dto.ts). A leaf is {field, operator,
// value, negate?}; groups nest with op AND/OR.
const ruleConditionSchema = z.object({
  field: z
    .enum(["any", "description", "remittanceInfo", "amount", "direction", "account"])
    .default("any"),
  operator: z.enum([
    "contains",
    "equals",
    "startsWith",
    "endsWith",
    "word",
    "matches",
    "gt",
    "gte",
    "lt",
    "lte",
    "between",
  ]),
  value: z.union([
    z.string().max(MAX_CONDITION_VALUE_LENGTH),
    z.number(),
    z.tuple([z.number(), z.number()]),
  ]),
  negate: z.boolean().optional(),
});

type ConditionNodeInput =
  | z.infer<typeof ruleConditionSchema>
  | { op: "AND" | "OR"; children: ConditionNodeInput[] };

const conditionNodeSchema: z.ZodType<ConditionNodeInput> = z.lazy(() =>
  z.union([
    ruleConditionSchema,
    z.object({
      op: z.enum(["AND", "OR"]),
      children: z.array(conditionNodeSchema).min(1),
    }),
  ]),
);

/** Accepts a tree, a bare group, or the legacy flat array (read as AND). */
const conditionsSchema = z.union([
  z.object({
    op: z.enum(["AND", "OR"]),
    children: z.array(conditionNodeSchema).min(1),
  }),
  z.array(ruleConditionSchema).min(1),
]);

/**
 * Reject a rule that is nested too deeply, has too many conditions, or carries a
 * regex that won't compile or is expensive to run — at save time rather than
 * silently never matching (or hanging) at run time. Shares the exact validation
 * the UI server actions use (`assertValidConditionTree`), so the two entry
 * points into the rule engine cannot drift.
 */
function normalizeConditions(input: unknown): ConditionGroup {
  const group = parseConditions(input);
  assertValidConditionTree(group);
  return group;
}

function errorResult(err: unknown, fallback: string): CallToolResult {
  return {
    content: [
      { type: "text", text: err instanceof Error ? err.message : fallback },
    ],
    isError: true,
  };
}

// Minimal shape of the auth context we attach in verifyToken.
type ToolExtra = {
  authInfo?: { scopes?: string[]; extra?: { userId?: string } };
};

/**
 * Resolve the acting user AND enforce the token's scope in one place. Every
 * tool declares whether it reads or writes; a token granted only `read` gets
 * an error from write tools instead of silently full access. The scopes on
 * authInfo are set by verifyToken (app/api/mcp/route.ts), which already
 * defaults legacy scope-less tokens to full access.
 */
function requireUserId(extra: ToolExtra, scope: KnownScope): string {
  const userId = extra.authInfo?.extra?.userId;
  if (!userId) throw new Error("Unauthenticated");
  const granted = extra.authInfo?.scopes ?? [];
  if (!hasScope(granted, scope)) {
    throw new Error(
      `Insufficient scope: this tool requires "${scope}" but the token grants ` +
        `[${granted.join(", ") || "none"}]. Reconnect the MCP integration to ` +
        `re-consent with the ${scope} scope.`,
    );
  }
  return userId;
}

function json(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

export function registerTools(server: McpServer): void {
  // ── list_transactions ───────────────────────────────────────────────────────
  server.registerTool(
    "list_transactions",
    {
      description:
        "List the user's transactions, most recent first. Filter by a date range " +
        "(dateFrom / dateTo, inclusive, format YYYY-MM-DD) to reach ANY period — " +
        "without a date filter you only get the most recent `limit` rows. Also " +
        "supports uncategorized-only and a description search. For large ranges, " +
        "page with `offset` (skip N rows). The result includes a `pageInfo` with " +
        "the total matching count so you know whether to page.\n" +
        "`categoryId` returns only what is filed under that category, INCLUDING its " +
        "subcategories (set includeSubcategories: false for the category alone). It " +
        "also accepts a deleted category, which is the only way to reach transactions " +
        "stranded in one. Use it with limit: 1 to read a count off `pageInfo.total` " +
        "without pulling rows.\n" +
        "`categoryCounts: true` adds `categoryCounts`, the per-category count over the " +
        "same filtered set — every visible category including those at 0, plus deleted " +
        "categories that still hold rows (`deleted: true`), plus `uncategorized`. That " +
        "is the audit view of the tree: empty categories, near-empty ones worth merging, " +
        "and where a rule actually landed. Counts are not affected by limit/offset.\n" +
        "Each row returns both text fields, which matters when writing rules: " +
        "`description` holds the merchant, while `remittanceInfo` holds the bank's own " +
        "label — for BBVA card payments a merchant category such as \"PAGO CON TARJETA EN " +
        "SUPERMERCADOS\", which is usually the better thing to write a rule against. " +
        "`categorizationSource` (RULE/AI/MANUAL) tells you whether a category was set by " +
        "hand — run_rule will not overwrite MANUAL.",
      inputSchema: {
        uncategorizedOnly: z.boolean().optional(),
        categoryId: z.string().optional(),
        includeSubcategories: z.boolean().optional(),
        categoryCounts: z.boolean().optional(),
        search: z.string().optional(),
        dateFrom: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
          .optional(),
        dateTo: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
          .optional(),
        limit: z.number().int().min(1).max(500).optional(),
        offset: z.number().int().min(0).optional(),
      },
    },
    async (
      {
        uncategorizedOnly,
        categoryId,
        includeSubcategories,
        categoryCounts,
        search,
        dateFrom,
        dateTo,
        limit,
        offset,
      },
      extra,
    ) => {
      const userId = requireUserId(extra as ToolExtra, "read");

      let scope: { ids: string[]; name: string; isActive: boolean } | null = null;
      try {
        if (categoryId && uncategorizedOnly) {
          throw new Error(
            "categoryId and uncategorizedOnly are mutually exclusive — a transaction " +
              "filed under a category is not uncategorized.",
          );
        }
        if (categoryId) {
          scope = await resolveCategoryFilter(userId, categoryId, includeSubcategories !== false);
        }
      } catch (err) {
        return errorResult(err, "list_transactions failed");
      }

      const base = uncategorizedOnly
        ? buildUncategorizedWhere(userId, search)
        : {
            userId,
            ...(search
              ? { description: { contains: search, mode: "insensitive" as const } }
              : {}),
          };

      // valueDate is a DATE column; parse YYYY-MM-DD as UTC midnight (inclusive).
      const valueDate: { gte?: Date; lte?: Date } = {};
      if (dateFrom) valueDate.gte = new Date(dateFrom);
      if (dateTo) valueDate.lte = new Date(dateTo);

      // Sibling keys are ANDed by Prisma, so this composes with the { AND: [...] }
      // that buildUncategorizedWhere returns.
      const where = {
        ...base,
        ...(dateFrom || dateTo ? { valueDate } : {}),
        ...(scope ? { categorization: { categoryId: { in: scope.ids } } } : {}),
      };

      const take = limit ?? 50;
      const skip = offset ?? 0;

      const [total, txs, counts] = await Promise.all([
        prisma.transaction.count({ where }),
        prisma.transaction.findMany({
          where,
          orderBy: { valueDate: "desc" },
          take,
          skip,
          include: {
            categorization: { include: { category: { select: { name: true } } } },
            bankAccount: { select: { name: true } },
          },
        }),
        categoryCounts
          ? categoryCountsForUser(userId, where as Prisma.TransactionWhereInput)
          : null,
      ]);

      return json({
        pageInfo: {
          total,
          returned: txs.length,
          offset: skip,
          hasMore: skip + txs.length < total,
        },
        ...(scope
          ? {
              filter: {
                category: scope.name,
                categoryIds: scope.ids,
                ...(scope.isActive ? {} : { categoryDeleted: true }),
              },
            }
          : {}),
        ...(counts
          ? {
              categoryCounts: counts,
              // Anything in the filtered set that no category claims: no
              // categorization at all, or a REJECTED one.
              uncategorized: total - counts.reduce((sum, c) => sum + c.count, 0),
            }
          : {}),
        transactions: txs.map((t) => ({
          id: t.id,
          date: t.valueDate.toISOString().slice(0, 10),
          amount: Number(t.amount),
          currency: t.currency,
          direction: t.direction,
          description: t.description,
          remittanceInfo: t.remittanceInfo,
          merchant: t.merchant,
          account: t.bankAccount?.name ?? null,
          category: t.categorization?.category?.name ?? null,
          categorizationStatus: t.categorization?.status ?? null,
          categorizationSource: t.categorization?.source ?? null,
        })),
      });
    },
  );

  // ── list_categories ─────────────────────────────────────────────────────────
  server.registerTool(
    "list_categories",
    {
      description:
        "List the categories available to the user (their own plus system defaults). Use the " +
        "returned id with bulk_categorize. `kind` says how the category counts: EXPENSE feeds " +
        "spending totals, INCOME feeds income, TRANSFER is excluded from both (money moving " +
        "between the user's own accounts).",
      inputSchema: {},
    },
    async (_args, extra) => {
      const userId = requireUserId(extra as ToolExtra, "read");
      const cats = await prisma.category.findMany({
        where: { OR: [{ userId }, { userId: null }], isActive: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          color: true,
          icon: true,
          parentId: true,
          kind: true,
        },
      });
      return json(cats);
    },
  );

  // ── list_accounts ─────────────────────────────────────────────────────────────
  server.registerTool(
    "list_accounts",
    {
      description:
        "List the user's connected bank accounts with their most recent known balance.",
      inputSchema: {},
    },
    async (_args, extra) => {
      const userId = requireUserId(extra as ToolExtra, "read");
      const accounts = await prisma.bankAccount.findMany({
        where: { userId, isActive: true },
        select: {
          id: true,
          name: true,
          type: true,
          currency: true,
          iban: true,
          balances: {
            orderBy: { date: "desc" },
            take: 1,
            select: { balance: true, date: true },
          },
        },
      });
      return json(
        accounts.map((a) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          currency: a.currency,
          ibanSuffix: a.iban,
          balance: a.balances[0] ? Number(a.balances[0].balance) : null,
          balanceDate: a.balances[0]?.date.toISOString().slice(0, 10) ?? null,
        })),
      );
    },
  );

  // ── get_budgets ───────────────────────────────────────────────────────────────
  server.registerTool(
    "get_budgets",
    {
      description:
        "Get the monthly budgets: the per-month savingsTarget (the v4 input the variable " +
        "budget derives from) and the per-category lines (rollover: false = variable " +
        "assignment, true = accumulation fund). Manage lines with upsert_budget_item / " +
        "delete_budget_item, the target with set_savings_target, and dated charges with " +
        "list_planned_items / create_planned_item.",
      inputSchema: {
        year: z.number().int().optional(),
        month: z.number().int().min(1).max(12).optional(),
      },
    },
    async ({ year, month }, extra) => {
      const userId = requireUserId(extra as ToolExtra, "read");
      const budgets = await prisma.budget.findMany({
        where: { userId, ...(year ? { year } : {}), ...(month ? { month } : {}) },
        orderBy: [{ year: "desc" }, { month: "desc" }],
        include: {
          budgetItems: {
            select: {
              plannedAmount: true,
              currency: true,
              rollover: true,
              category: { select: { name: true } },
            },
          },
        },
      });
      return json(
        budgets.map((b) => ({
          id: b.id,
          year: b.year,
          month: b.month,
          name: b.name,
          savingsTarget: Number(b.savingsTarget),
          items: b.budgetItems.map((i) => ({
            category: i.category.name,
            plannedAmount: Number(i.plannedAmount),
            currency: i.currency,
            rollover: i.rollover,
          })),
        })),
      );
    },
  );

  // ── get_month_status ──────────────────────────────────────────────────────
  server.registerTool(
    "get_month_status",
    {
      description:
        "The month's money position under the v4 model. cascade: expected income - fixed " +
        "charges - fund quotas - savingsTarget = variableBudget (the residue; " +
        "assignedVariable is the category split and assignmentGap the mismatch, shown " +
        "never auto-squared). weekly: the daily-rate available (never month/4; ISO weeks). " +
        "chargeControl: EVERY non-rollover objective, each with consumed vs assigned, " +
        "weekConsumed, fixedTotal (the recurring, already-committed slice of the budget) " +
        "and fixedMatched, plus the end-of-month projection — fixedTotal + the run rate of " +
        "the discretionary part only, since extrapolating rent daily is meaningless — and " +
        "OK/RIESGO/EXCEDIDO, ordered by projected deviation. control: the subset with " +
        "fixedTotal 0, the purely discretionary ones the daily screen acts on. " +
        "funds: rollover accumulation (quota + balance). Defaults to the current month.",
      inputSchema: {
        year: z.number().int().optional(),
        month: z.number().int().min(1).max(12).optional(),
      },
    },
    async ({ year, month }, extra) => {
      const userId = requireUserId(extra as ToolExtra, "read");
      try {
        const prefs = await getUserPrefs(userId);
        const target = year && month ? { year, month } : undefined;
        const s = await buildMonthStatus(userId, prefs.timezone, target);
        return json({
          year: s.year,
          month: s.month,
          today: s.today,
          provisional: s.provisional,
          monthElapsed: s.monthElapsed,
          cascade: s.cascade,
          weekly: s.weekly,
          opsThisWeek: s.opsThisWeek,
          opsMedian: s.opsMedian,
          spentThisWeek: s.spentThisWeek,
          variableSpentMonth: s.variableSpentMonth,
          control: s.control,
          chargeControl: s.chargeControl,
          funds: s.objectives
            .filter((o) => o.rollover)
            .map((o) => ({
              categoryId: o.categoryId,
              category: o.categoryName,
              quota: o.extra,
              balance: o.balance,
            })),
        });
      } catch (err) {
        return errorResult(err, "get_month_status failed");
      }
    },
  );

  // ── set_savings_target ────────────────────────────────────────────────────
  server.registerTool(
    "set_savings_target",
    {
      description:
        "Set the monthly savings GOAL — the v4 input the variable budget derives from: " +
        "variable = expected income (CREDIT planned items) - fixed charges (DEBIT planned " +
        "items) - rollover fund quotas - savingsTarget. Stored per month so the progression " +
        "stays on record. There is no inverse mode: move the target, the variable moves.",
      inputSchema: {
        year: z.number().int(),
        month: z.number().int().min(1).max(12),
        amount: z.number().min(0),
      },
    },
    async ({ year, month, amount }, extra) => {
      const userId = requireUserId(extra as ToolExtra, "write");
      try {
        const budget = await prisma.budget.upsert({
          where: { userId_year_month: { userId, year, month } },
          create: { userId, year, month, savingsTarget: amount },
          update: { savingsTarget: amount },
          select: { year: true, month: true, savingsTarget: true },
        });
        return json({
          year: budget.year,
          month: budget.month,
          savingsTarget: Number(budget.savingsTarget),
        });
      } catch (err) {
        return errorResult(err, "set_savings_target failed");
      }
    },
  );

  // ── Recurring series + planned items + budget assignments (v2 model) ───────
  server.registerTool(
    "list_recurring_series",
    {
      description:
        "List the hand-maintained recurring series registry: standing charges and income " +
        "with expected amount, cadence (MONTHLY/BIMONTHLY/QUARTERLY/YEARLY), day window or " +
        "month-end anchor, matcher text (looked for in transaction descriptors to link " +
        "arrivals) and account. Series generate planned_items forward; matching drives the " +
        "price-deviation and missed-charge alerts.",
      inputSchema: {},
    },
    async (_args, extra) => {
      const userId = requireUserId(extra as ToolExtra, "read");
      return json(await listSeriesForUser(userId));
    },
  );

  server.registerTool(
    "create_recurring_series",
    {
      description:
        "Register a standing charge or income. matcher (optional, defaults to displayName): text found (accents/case folded) in " +
        "the transaction's descriptors — e.g. 'ALQUILER', 'O2 FIBRA'. windowFromDay/windowToDay " +
        "model charges with a variable date (rent: 1–6); anchorMonthEnd: true is for charges on " +
        "the month's LAST day (mortgage). anchorDate (YYYY-MM-DD, any date in a due month) " +
        "anchors BIMONTHLY/QUARTERLY/YEARLY cadences.",
      inputSchema: {
        displayName: z.string().max(120),
        matcher: z.string().min(3).max(120).optional(),
        ruleId: z.string().optional(),
        direction: z.enum(["DEBIT", "CREDIT"]),
        categoryId: z.string().optional(),
        bankAccountId: z.string().optional(),
        cadence: z.enum(["WEEKLY", "MONTHLY", "BIMONTHLY", "QUARTERLY", "YEARLY", "IRREGULAR"]),
        expectedAmount: z.number().min(0),
        windowFromDay: z.number().int().min(1).max(31).optional(),
        windowToDay: z.number().int().min(1).max(31).optional(),
        anchorMonthEnd: z.boolean().optional(),
        aggregate: z.boolean().optional(),
        skipMonths: z.array(z.number().int().min(1).max(12)).optional(),
        anchorDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      },
    },
    async (
      { displayName, matcher, ruleId, direction, categoryId, bankAccountId, cadence, expectedAmount, windowFromDay, windowToDay, anchorMonthEnd, aggregate, skipMonths, anchorDate },
      extra,
    ) => {
      const userId = requireUserId(extra as ToolExtra, "write");
      try {
        return json(
          await createSeriesForUser(userId, {
            displayName,
            matcher,
            ruleId: ruleId ?? null,
            direction,
            categoryId: categoryId ?? null,
            bankAccountId: bankAccountId ?? null,
            cadence,
            expectedAmount,
            windowFromDay: windowFromDay ?? null,
            windowToDay: windowToDay ?? null,
            anchorMonthEnd,
            aggregate,
            skipMonths,
            anchorDate: anchorDate ?? null,
          }),
        );
      } catch (err) {
        return errorResult(err, "create_recurring_series failed");
      }
    },
  );

  server.registerTool(
    "update_recurring_series",
    {
      description:
        "Replace a series' definition (same fields as create_recurring_series, plus active: " +
        "false to pause generation). Pending planned instances are updated to mirror it; " +
        "after a real price change, update expectedAmount so next month expects the new price.",
      inputSchema: {
        seriesId: z.string(),
        displayName: z.string().max(120),
        matcher: z.string().min(3).max(120).optional(),
        ruleId: z.string().optional(),
        direction: z.enum(["DEBIT", "CREDIT"]),
        categoryId: z.string().optional(),
        bankAccountId: z.string().optional(),
        cadence: z.enum(["WEEKLY", "MONTHLY", "BIMONTHLY", "QUARTERLY", "YEARLY", "IRREGULAR"]),
        expectedAmount: z.number().min(0),
        windowFromDay: z.number().int().min(1).max(31).optional(),
        windowToDay: z.number().int().min(1).max(31).optional(),
        anchorMonthEnd: z.boolean().optional(),
        aggregate: z.boolean().optional(),
        skipMonths: z.array(z.number().int().min(1).max(12)).optional(),
        anchorDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        active: z.boolean().optional(),
      },
    },
    async (
      { seriesId, displayName, matcher, ruleId, direction, categoryId, bankAccountId, cadence, expectedAmount, windowFromDay, windowToDay, anchorMonthEnd, aggregate, skipMonths, anchorDate, active },
      extra,
    ) => {
      const userId = requireUserId(extra as ToolExtra, "write");
      try {
        return json(
          await updateSeriesForUser(userId, seriesId, {
            displayName,
            matcher,
            ruleId: ruleId ?? null,
            direction,
            categoryId: categoryId ?? null,
            bankAccountId: bankAccountId ?? null,
            cadence,
            expectedAmount,
            windowFromDay: windowFromDay ?? null,
            windowToDay: windowToDay ?? null,
            anchorMonthEnd,
            aggregate,
            skipMonths,
            anchorDate: anchorDate ?? null,
            active,
          }),
        );
      } catch (err) {
        return errorResult(err, "update_recurring_series failed");
      }
    },
  );

  server.registerTool(
    "delete_recurring_series",
    {
      description:
        "Delete a series and its planned instances (matched history included).",
      inputSchema: { seriesId: z.string() },
    },
    async ({ seriesId }, extra) => {
      const userId = requireUserId(extra as ToolExtra, "write");
      try {
        return json(await deleteSeriesForUser(userId, seriesId));
      } catch (err) {
        return errorResult(err, "delete_recurring_series failed");
      }
    },
  );

  server.registerTool(
    "list_planned_items",
    {
      description:
        "List planned items — dated expected charges/income, the SOURCE OF TRUTH the monthly " +
        "cascade derives from. Series-generated instances and hand-typed one-offs live in the " +
        "same list. status: PENDING (expected), MATCHED (a transaction arrived in the window " +
        "and was linked, matchedAmount holds what actually arrived), MISSED (window closed " +
        "with nothing). matchedTransactionIds always carries the 1..n absorbed " +
        "transactions of a matched item (matchedTransactionId is a legacy " +
        "single-value alias of the first). Filter by year/month, and by status to " +
        "get only PENDING / MATCHED / MISSED. Series items carry recognition diagnostics: " +
        "seriesHistoricMatches (how many transactions the series recognizes across " +
        "the whole history — 0 means the matcher is broken), candidatesInWindow " +
        "(recognized inside this period's window), and windowStatus " +
        "(FUTURE / OPEN / CLOSED) — so a healthy series whose charge simply has " +
        "not arrived is distinguishable from a misconfigured one.",
      inputSchema: {
        year: z.number().int().optional(),
        month: z.number().int().min(1).max(12).optional(),
        status: z.enum(["PENDING", "MATCHED", "MISSED"]).optional(),
      },
    },
    async ({ year, month, status }, extra) => {
      const userId = requireUserId(extra as ToolExtra, "read");
      return json(await listPlannedItemsForUser(userId, { year, month, status }));
    },
  );

  server.registerTool(
    "create_planned_item",
    {
      description:
        "Add a one-off expected charge (this year's IBI) to a specific month. Series " +
        "instances are engine-generated — use create_recurring_series for those. dueDay or a " +
        "window narrows when in the month it lands; omit both for 'any day'.",
      inputSchema: {
        description: z.string().max(120),
        direction: z.enum(["DEBIT", "CREDIT"]).optional(),
        categoryId: z.string(),
        bankAccountId: z.string().optional(),
        amount: z.number().positive(),
        year: z.number().int(),
        month: z.number().int().min(1).max(12),
        dueDay: z.number().int().min(1).max(31).optional(),
        windowFromDay: z.number().int().min(1).max(31).optional(),
        windowToDay: z.number().int().min(1).max(31).optional(),
      },
    },
    async (
      { description, direction, categoryId, bankAccountId, amount, year, month, dueDay, windowFromDay, windowToDay },
      extra,
    ) => {
      const userId = requireUserId(extra as ToolExtra, "write");
      try {
        return json(
          await createPlannedItemForUser(userId, {
            description,
            direction,
            categoryId: categoryId ?? null,
            bankAccountId: bankAccountId ?? null,
            amount,
            year,
            month,
            dueDay: dueDay ?? null,
            windowFromDay: windowFromDay ?? null,
            windowToDay: windowToDay ?? null,
          }),
        );
      } catch (err) {
        return errorResult(err, "create_planned_item failed");
      }
    },
  );

  server.registerTool(
    "update_planned_item",
    {
      description:
        "Edit a hand-typed one-off planned item (e.g. this year's IBI changed amount). " +
        "Only PENDING one-offs: series instances are engine-owned (edit the series) and " +
        "matched history never rewrites. Omitted fields stay unchanged.",
      inputSchema: {
        plannedItemId: z.string(),
        description: z.string().max(120).optional(),
        categoryId: z.string().optional(),
        amount: z.number().positive().optional(),
        year: z.number().int().optional(),
        month: z.number().int().min(1).max(12).optional(),
        dueDay: z.number().int().min(1).max(31).nullable().optional(),
        windowFromDay: z.number().int().min(1).max(31).nullable().optional(),
        windowToDay: z.number().int().min(1).max(31).nullable().optional(),
      },
    },
    async (
      { plannedItemId, description, categoryId, amount, year, month, dueDay, windowFromDay, windowToDay },
      extra,
    ) => {
      const userId = requireUserId(extra as ToolExtra, "write");
      try {
        return json(
          await updatePlannedItemForUser(userId, plannedItemId, {
            description,
            categoryId,
            amount,
            year,
            month,
            dueDay,
            windowFromDay,
            windowToDay,
          }),
        );
      } catch (err) {
        return errorResult(err, "update_planned_item failed");
      }
    },
  );

  server.registerTool(
    "delete_planned_item",
    {
      description:
        "Delete a hand-typed one-off planned item. Series-generated instances are refused — " +
        "edit or delete the series instead.",
      inputSchema: { plannedItemId: z.string() },
    },
    async ({ plannedItemId }, extra) => {
      const userId = requireUserId(extra as ToolExtra, "write");
      try {
        return json(await deletePlannedItemForUser(userId, plannedItemId));
      } catch (err) {
        return errorResult(err, "delete_planned_item failed");
      }
    },
  );

  server.registerTool(
    "upsert_budget_item",
    {
      description:
        "Set a category's assignment for a month. rollover: false = classic budget line " +
        "(resets monthly); rollover: true = accumulation fund (IBI, holidays — the unspent " +
        "remainder rolls forward, the quota joins the monthly cascade, and the current " +
        "month's row propagates into the next automatically). This is the create_budget " +
        "write path the MCP lacked.",
      inputSchema: {
        categoryId: z.string(),
        year: z.number().int(),
        month: z.number().int().min(1).max(12),
        assigned: z.number().min(0),
        rollover: z.boolean().optional(),
      },
    },
    async ({ categoryId, year, month, assigned, rollover }, extra) => {
      const userId = requireUserId(extra as ToolExtra, "write");
      try {
        return json(
          await upsertBudgetItemForUser(userId, { categoryId, year, month, assigned, rollover }),
        );
      } catch (err) {
        return errorResult(err, "upsert_budget_item failed");
      }
    },
  );

  server.registerTool(
    "delete_budget_item",
    {
      description:
        "Remove a category's assignment for a month. Deleting a rollover fund's CURRENT " +
        "month row retires the fund (propagation only looks one month back); its history " +
        "and accumulated balance stay derivable.",
      inputSchema: {
        categoryId: z.string(),
        year: z.number().int(),
        month: z.number().int().min(1).max(12),
      },
    },
    async ({ categoryId, year, month }, extra) => {
      const userId = requireUserId(extra as ToolExtra, "write");
      try {
        return json(await deleteBudgetItemForUser(userId, { categoryId, year, month }));
      } catch (err) {
        return errorResult(err, "delete_budget_item failed");
      }
    },
  );

  // ── bulk_categorize ─────────────────────────────────────────────────────────
  server.registerTool(
    "bulk_categorize",
    {
      description:
        "Assign a category to many transactions at once (marks them MANUAL/APPROVED). Target either an explicit list of transaction ids, or all uncategorized transactions matching a search term. Returns how many were updated.",
      inputSchema: {
        categoryId: z.string(),
        transactionIds: z.array(z.string()).optional(),
        search: z.string().optional(),
      },
    },
    async ({ categoryId, transactionIds, search }, extra) => {
      const userId = requireUserId(extra as ToolExtra, "write");
      try {
        const count = await bulkCategorizeForUser(userId, categoryId, {
          transactionIds,
          search,
        });
        return json({ updated: count });
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: err instanceof Error ? err.message : "bulk_categorize failed",
            },
          ],
          isError: true,
        };
      }
    },
  );

  // ── sync_connections ──────────────────────────────────────────────────────────
  server.registerTool(
    "sync_connections",
    {
      description:
        "Trigger a background sync of the user's bank connections (fetches new balances and transactions). Optionally target a single connectionId; otherwise all active connections are queued. Returns how many were queued.",
      inputSchema: {
        connectionId: z.string().optional(),
      },
    },
    async ({ connectionId }, extra) => {
      const userId = requireUserId(extra as ToolExtra, "write");
      const connections = await prisma.bankConnection.findMany({
        where: {
          userId,
          status: "ACTIVE",
          ...(connectionId ? { id: connectionId } : {}),
        },
        select: { id: true },
      });
      await Promise.all(
        connections.map((c) =>
          send<SyncConnectionMessage>(TOPICS.syncConnection, {
            connectionId: c.id,
            userId,
          }),
        ),
      );
      return json({ queued: connections.length });
    },
  );

  // ── create_category ─────────────────────────────────────────────────────────
  server.registerTool(
    "create_category",
    {
      description:
        "Create a new category (or a subcategory when parentId is given). color is a hex " +
        "string like #6366f1. `kind` defaults to EXPENSE — set INCOME for earnings and " +
        "TRANSFER for movements between the user's own accounts, which are excluded from " +
        "both spending and income totals. Nesting is limited to two levels.",
      inputSchema: {
        name: z.string(),
        color: z.string().optional(),
        parentId: z.string().optional(),
        kind: z.enum(["EXPENSE", "INCOME", "TRANSFER"]).optional(),
      },
    },
    async ({ name, color, parentId, kind }, extra) => {
      const userId = requireUserId(extra as ToolExtra, "write");
      try {
        return json(await createCategoryForUser(userId, { name, color, parentId, kind }));
      } catch (err) {
        return errorResult(err, "create_category failed");
      }
    },
  );

  // ── update_category ─────────────────────────────────────────────────────────
  server.registerTool(
    "update_category",
    {
      description:
        "Rename, recolor, re-parent or re-classify one of the user's own categories (system " +
        "defaults can't be edited). Only the provided fields change.\n" +
        "`parentId` moves the category: pass an id to nest it under a top-level category, or " +
        "null to promote it to the top level. Rejected if it would create a cycle, if the " +
        "category has subcategories of its own, or if the target is itself a subcategory — " +
        "nesting is limited to two levels.\n" +
        "`kind` controls how it counts: EXPENSE in spending totals, INCOME in income, TRANSFER " +
        "in neither.\n" +
        "`isActive: true` restores a soft-deleted category — the undo delete_category never " +
        "had. Rules deactivated by the deletion stay off; re-enable them (or write new ones) " +
        "explicitly. A subcategory can only be restored under an active parent.",
      inputSchema: {
        categoryId: z.string(),
        name: z.string().optional(),
        color: z.string().optional(),
        kind: z.enum(["EXPENSE", "INCOME", "TRANSFER"]).optional(),
        parentId: z.string().nullable().optional(),
        isActive: z.boolean().optional(),
      },
    },
    async ({ categoryId, name, color, kind, parentId, isActive }, extra) => {
      const userId = requireUserId(extra as ToolExtra, "write");
      try {
        return json(
          await updateCategoryForUser(userId, categoryId, {
            name,
            color,
            kind,
            parentId,
            isActive,
          }),
        );
      } catch (err) {
        return errorResult(err, "update_category failed");
      }
    },
  );

  // ── delete_category ─────────────────────────────────────────────────────────
  server.registerTool(
    "delete_category",
    {
      description:
        "Delete one of the user's own categories (system defaults can't be deleted). Its " +
        "subcategories go with it. This is a soft delete: the category stops appearing " +
        "everywhere in the app, but historical rows keep referencing it.\n" +
        "If transactions are filed under it, the call is REFUSED unless you say what " +
        "happens to them — otherwise they would sit in a deleted category where the app " +
        "cannot show them (the categorize inbox only picks up transactions with no " +
        "category). Either pass `reassignToCategoryId` to move them to another category " +
        "(they become MANUAL/APPROVED and lose their rule link, so a rule run won't undo the " +
        "move), " +
        "or `force: true` to strip their categorization and send them back to the " +
        "categorize inbox. Check the count first with " +
        "list_transactions({categoryId, limit: 1}).\n" +
        "Rules TARGETING the category are deactivated, because a rule keeps running off its " +
        "own isActive flag and would otherwise go on categorizing into a deleted category — " +
        "the response lists them and update_rule can re-enable them against another " +
        "category. Rules using it as `sourceCategoryId`, plan items, recurring series and " +
        "budget items are left untouched and only reported.\n" +
        "To retire a category without deleting anything, rename it or move its " +
        "transactions with bulk_categorize instead.",
      inputSchema: {
        categoryId: z.string(),
        reassignToCategoryId: z.string().optional(),
        force: z.boolean().optional(),
      },
    },
    async ({ categoryId, reassignToCategoryId, force }, extra) => {
      const userId = requireUserId(extra as ToolExtra, "write");
      try {
        return json(
          await deleteCategoryForUser(userId, categoryId, { reassignToCategoryId, force }),
        );
      } catch (err) {
        return errorResult(err, "delete_category failed");
      }
    },
  );

  // ── list_rules ────────────────────────────────────────────────────────────────
  server.registerTool(
    "list_rules",
    {
      description:
        "List the user's categorization rules in evaluation order — first in the list runs " +
        "first and wins. Includes conditions, target category, ids and " +
        "run metrics: `matchCount` is how many transactions the rule claimed in its most " +
        "recent run, and `neverMatched` flags a rule that has run but has never matched " +
        "anything in any run (lastMatchAt is null) — usually a sign its conditions look " +
        "at the wrong field or word. A rule with matchCount 0 but neverMatched false is " +
        "healthy: it simply had nothing new to claim last run.",
      inputSchema: {},
    },
    async (_args, extra) => {
      const userId = requireUserId(extra as ToolExtra, "read");
      return json(await listRulesForUser(userId));
    },
  );

  // ── create_rule ───────────────────────────────────────────────────────────────
  server.registerTool(
    "create_rule",
    {
      description:
        "Create a categorization rule. `conditions` is a tree: {op:'AND'|'OR', children:[...]}, " +
        "where a leaf is {field, operator, value, negate?}. A plain array is accepted and read as AND.\n" +
        "Fields: 'any' (DEFAULT — searches description and remittanceInfo together), " +
        "'description', 'remittanceInfo', 'amount', 'direction', 'account'.\n" +
        "Which text field to target matters. `description` is the merchant " +
        "(\"PAGO CON TARJETA CONDIS TRES SENYORES BARCELONA ES\"). `remittanceInfo` is the " +
        "bank's own label, and for BBVA card payments that is a merchant CATEGORY " +
        "(\"PAGO CON TARJETA EN SUPERMERCADOS\", \"...EN RESTAURANTES Y CAFETERIAS\", " +
        "\"...EN MEDICINA,FARMACIA Y SANIDAD\"). Targeting that category gives far broader " +
        "coverage than listing merchants, and keeps working for merchants never seen before — " +
        "prefer it for card spending. For non-card operations remittanceInfo is coarse " +
        "(\"ADEUDO A SU CARGO\", \"TRANSFERENCIAS\", \"BIZUM\"), so match the merchant in " +
        "description instead. Call list_transactions first and look at both fields.\n" +
        "Text operators: contains, word (whole word — use it to stop DIA matching CLAUDIA or " +
        "ESCLAT matching ESCLATOIL), equals, startsWith, endsWith, matches (regex).\n" +
        "Amount operators: equals, gt, gte, lt, lte, between ([min,max]). Amounts are unsigned " +
        "magnitudes — use direction ('DEBIT'|'CREDIT') to tell money out from money in.\n" +
        "Text comparison folds accents and case, so AMORTIZACION matches AMORTIZACIÓN. " +
        "`negate: true` inverts a condition, which is how you exclude.\n" +
        "Order: a rule's POSITION in the list is its precedence — earlier runs first and the " +
        "first matching rule wins. `priority` is how that position is stored (lower = earlier); " +
        "omit it and the rule is appended LAST, then move it with reorder_rules. Put the " +
        "specific rule before the generic one (fuel before groceries), and a MERCHANT rule " +
        "(`description`) before the bank-category-label rules (`remittanceInfo`): the bank label " +
        "is high-coverage but wrong for some merchants — ON STAGE MONTJUIC (concert tickets) " +
        "arrives as \"EN HOGAR, MUEBLES\", MULTIOPTICAS as \"EN DISCOS, LIBROS, FOTOS Y PC'S\" — " +
        "so a per-merchant rule has to sit above it to win.\n" +
        "sourceCategoryId (optional) restricts matching to transactions already in that category. " +
        "Creating a rule does NOT apply it — call run_rule (start with dryRun: true).",
      inputSchema: {
        name: z.string(),
        conditions: conditionsSchema,
        categoryId: z.string(),
        sourceCategoryId: z.string().optional(),
        priority: z.number().int().optional(),
      },
    },
    async ({ name, conditions, categoryId, sourceCategoryId, priority }, extra) => {
      const userId = requireUserId(extra as ToolExtra, "write");
      try {
        return json(
          await createRuleForUser(userId, {
            name,
            conditions: normalizeConditions(conditions),
            categoryId,
            sourceCategoryId,
            priority,
          }),
        );
      } catch (err) {
        return errorResult(err, "create_rule failed");
      }
    },
  );

  // ── update_rule ───────────────────────────────────────────────────────────────
  server.registerTool(
    "update_rule",
    {
      description:
        "Update a rule's name, conditions, target category or enabled state (`isActive: false` " +
        "keeps the rule but stops it running — it is skipped by every run, including the " +
        "post-sync one). Only the provided fields change; `conditions` " +
        "replaces the whole tree. To move a rule in the evaluation order use reorder_rules. " +
        "Does NOT re-apply the rule — call run_rule afterwards.",
      inputSchema: {
        ruleId: z.string(),
        name: z.string().optional(),
        conditions: conditionsSchema.optional(),
        categoryId: z.string().optional(),
        isActive: z.boolean().optional(),
      },
    },
    async ({ ruleId, name, conditions, categoryId, isActive }, extra) => {
      const userId = requireUserId(extra as ToolExtra, "write");
      try {
        return json(
          await updateRuleForUser(userId, ruleId, {
            name,
            conditions: conditions === undefined ? undefined : normalizeConditions(conditions),
            categoryId,
            isActive,
          }),
        );
      } catch (err) {
        return errorResult(err, "update_rule failed");
      }
    },
  );

  // ── reorder_rules ─────────────────────────────────────────────────────────────
  server.registerTool(
    "reorder_rules",
    {
      description:
        "Set the evaluation order of ALL rules at once. `ruleIds` must list every rule the " +
        "user has, exactly once, in the order they should run — first in the list runs first " +
        "and the first match wins. Call list_rules to get the current order, move the ids you " +
        "need and send the whole array back; a partial list is rejected so a stale view can't " +
        "silently drop a rule. Positions are renumbered from 0. Does NOT re-apply anything — " +
        "call run_rule (dryRun first) to see the new order's effect.",
      inputSchema: {
        ruleIds: z.array(z.string()),
      },
    },
    async ({ ruleIds }, extra) => {
      const userId = requireUserId(extra as ToolExtra, "write");
      try {
        return json(await reorderRulesForUser(userId, ruleIds));
      } catch (err) {
        return errorResult(err, "reorder_rules failed");
      }
    },
  );

  // ── delete_rule ───────────────────────────────────────────────────────────────
  server.registerTool(
    "delete_rule",
    {
      description:
        "Delete a rule permanently. Transactions it categorized KEEP their category but " +
        "lose the link to the rule, so they can no longer be reverted — call undo_rule_run " +
        "FIRST if you want them uncategorized again. To stop a rule without losing it, use " +
        "update_rule with isActive: false instead.",
      inputSchema: {
        ruleId: z.string(),
      },
    },
    async ({ ruleId }, extra) => {
      const userId = requireUserId(extra as ToolExtra, "write");
      try {
        return json(await deleteRuleForUser(userId, ruleId));
      } catch (err) {
        return errorResult(err, "delete_rule failed");
      }
    },
  );

  // ── test_rule ─────────────────────────────────────────────────────────────────
  server.registerTool(
    "test_rule",
    {
      description:
        "Evaluate rule conditions WITHOUT creating or applying anything. Returns how many " +
        "transactions match plus a sample. Use this to iterate on conditions in one call " +
        "instead of create → run → inspect → update. Same condition format as create_rule.",
      inputSchema: {
        conditions: conditionsSchema,
        sourceCategoryId: z.string().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      },
    },
    async ({ conditions, sourceCategoryId, limit }, extra) => {
      const userId = requireUserId(extra as ToolExtra, "read");
      try {
        return json(
          await testConditions(
            userId,
            normalizeConditions(conditions),
            sourceCategoryId ?? null,
            limit ?? 10,
          ),
        );
      } catch (err) {
        return errorResult(err, "test_rule failed");
      }
    },
  );

  // ── undo_rule_run ─────────────────────────────────────────────────────────────
  server.registerTool(
    "undo_rule_run",
    {
      description:
        "Revert everything a rule has categorized: each affected transaction goes back to the " +
        "category and source it had before, and rows the rule created are removed. Note this " +
        "undoes ALL of the rule's work, not only its most recent run. Transactions whose previous " +
        "category has since been deleted are left uncategorized.",
      inputSchema: {
        ruleId: z.string(),
      },
    },
    async ({ ruleId }, extra) => {
      const userId = requireUserId(extra as ToolExtra, "write");
      try {
        return json(await undoRuleRun(userId, ruleId));
      } catch (err) {
        return errorResult(err, "undo_rule_run failed");
      }
    },
  );

  // ── run_rule ──────────────────────────────────────────────────────────────────
  server.registerTool(
    "run_rule",
    {
      description:
        "Execute rules now, categorizing matching transactions (RULE/APPROVED). Omit ruleId to " +
        "run ALL active rules.\n" +
        "Rules run in priority order (lower number first) and the FIRST matching rule wins — a " +
        "transaction is claimed once per run.\n" +
        "Manually categorized transactions are never overwritten unless force: true.\n" +
        "ALWAYS start with dryRun: true — it writes nothing and returns per-rule match counts, a " +
        "sample, and `conflicts` listing transactions more than one rule wanted (the winner first). " +
        "Runs are reversible with undo_rule_run.",
      inputSchema: {
        ruleId: z.string().optional(),
        dryRun: z.boolean().optional(),
        force: z.boolean().optional(),
      },
    },
    async ({ ruleId, dryRun, force }, extra) => {
      const userId = requireUserId(extra as ToolExtra, "write");
      try {
        const report = ruleId
          ? await runRuleForUser(userId, ruleId, { dryRun, force })
          : await runAllRulesForUser(userId, { dryRun, force });
        return json(report);
      } catch (err) {
        return errorResult(err, "run_rule failed");
      }
    },
  );
}
