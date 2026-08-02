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
import { buildUncategorizedWhere } from "@/lib/categorize";
import { bulkCategorizeForUser } from "@/lib/mcp/categorize";
import {
  createCategoryForUser,
  updateCategoryForUser,
  listRulesForUser,
  createRuleForUser,
  updateRuleForUser,
  runRuleForUser,
  runAllRulesForUser,
} from "@/lib/mcp/manage";
import { send } from "@vercel/queue";
import { TOPICS, type SyncConnectionMessage } from "@/lib/queue";

// Rule condition shape (see lib/rules/rule-dto.ts).
const ruleConditionSchema = z.object({
  field: z.enum(["description", "remittanceInfo"]),
  operator: z.enum(["contains", "equals", "startsWith", "endsWith"]),
  value: z.string(),
});

function errorResult(err: unknown, fallback: string): CallToolResult {
  return {
    content: [
      { type: "text", text: err instanceof Error ? err.message : fallback },
    ],
    isError: true,
  };
}

// Minimal shape of the auth context we attach in verifyToken.
type ToolExtra = { authInfo?: { extra?: { userId?: string } } };

function requireUserId(extra: ToolExtra): string {
  const userId = extra.authInfo?.extra?.userId;
  if (!userId) throw new Error("Unauthenticated");
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
        "the total matching count so you know whether to page.",
      inputSchema: {
        uncategorizedOnly: z.boolean().optional(),
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
      { uncategorizedOnly, search, dateFrom, dateTo, limit, offset },
      extra,
    ) => {
      const userId = requireUserId(extra as ToolExtra);
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
      const where =
        dateFrom || dateTo ? { ...base, valueDate } : base;

      const take = limit ?? 50;
      const skip = offset ?? 0;

      const [total, txs] = await Promise.all([
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
      ]);

      return json({
        pageInfo: {
          total,
          returned: txs.length,
          offset: skip,
          hasMore: skip + txs.length < total,
        },
        transactions: txs.map((t) => ({
          id: t.id,
          date: t.valueDate.toISOString().slice(0, 10),
          amount: Number(t.amount),
          currency: t.currency,
          direction: t.direction,
          description: t.description,
          account: t.bankAccount?.name ?? null,
          category: t.categorization?.category?.name ?? null,
          categorizationStatus: t.categorization?.status ?? null,
        })),
      });
    },
  );

  // ── list_categories ─────────────────────────────────────────────────────────
  server.registerTool(
    "list_categories",
    {
      description:
        "List the categories available to the user (their own plus system defaults). Use the returned id with bulk_categorize.",
      inputSchema: {},
    },
    async (_args, extra) => {
      const userId = requireUserId(extra as ToolExtra);
      const cats = await prisma.category.findMany({
        where: { OR: [{ userId }, { userId: null }], isActive: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true, color: true, icon: true, parentId: true },
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
      const userId = requireUserId(extra as ToolExtra);
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
        "Get the user's monthly budgets and their per-category planned amounts.",
      inputSchema: {
        year: z.number().int().optional(),
        month: z.number().int().min(1).max(12).optional(),
      },
    },
    async ({ year, month }, extra) => {
      const userId = requireUserId(extra as ToolExtra);
      const budgets = await prisma.budget.findMany({
        where: { userId, ...(year ? { year } : {}), ...(month ? { month } : {}) },
        orderBy: [{ year: "desc" }, { month: "desc" }],
        include: {
          budgetItems: {
            select: {
              plannedAmount: true,
              currency: true,
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
          items: b.budgetItems.map((i) => ({
            category: i.category.name,
            plannedAmount: Number(i.plannedAmount),
            currency: i.currency,
          })),
        })),
      );
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
      const userId = requireUserId(extra as ToolExtra);
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
      const userId = requireUserId(extra as ToolExtra);
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
        "Create a new category (or a subcategory when parentId is given). Returns the created category. color is a hex string like #6366f1.",
      inputSchema: {
        name: z.string(),
        color: z.string().optional(),
        parentId: z.string().optional(),
      },
    },
    async ({ name, color, parentId }, extra) => {
      const userId = requireUserId(extra as ToolExtra);
      try {
        return json(await createCategoryForUser(userId, { name, color, parentId }));
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
        "Rename and/or recolor one of the user's own categories (system default categories can't be edited).",
      inputSchema: {
        categoryId: z.string(),
        name: z.string().optional(),
        color: z.string().optional(),
      },
    },
    async ({ categoryId, name, color }, extra) => {
      const userId = requireUserId(extra as ToolExtra);
      try {
        return json(await updateCategoryForUser(userId, categoryId, { name, color }));
      } catch (err) {
        return errorResult(err, "update_category failed");
      }
    },
  );

  // ── list_rules ────────────────────────────────────────────────────────────────
  server.registerTool(
    "list_rules",
    {
      description:
        "List the user's categorization rules (with their conditions, target category and ids). Use the returned id with update_rule / run_rule.",
      inputSchema: {},
    },
    async (_args, extra) => {
      const userId = requireUserId(extra as ToolExtra);
      return json(await listRulesForUser(userId));
    },
  );

  // ── create_rule ───────────────────────────────────────────────────────────────
  server.registerTool(
    "create_rule",
    {
      description:
        "Create a categorization rule. conditions is an array of {field, operator, value}; field is 'description' or 'remittanceInfo', operator is contains/equals/startsWith/endsWith. All conditions must match (AND). categoryId is the target category. sourceCategoryId (optional) restricts matching to transactions already in that category. Creating a rule does NOT apply it — call run_rule to execute.",
      inputSchema: {
        name: z.string(),
        conditions: z.array(ruleConditionSchema).min(1),
        categoryId: z.string(),
        sourceCategoryId: z.string().optional(),
        priority: z.number().int().optional(),
      },
    },
    async ({ name, conditions, categoryId, sourceCategoryId, priority }, extra) => {
      const userId = requireUserId(extra as ToolExtra);
      try {
        return json(
          await createRuleForUser(userId, {
            name,
            conditions,
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
        "Update a rule's name, conditions, target category, active state and/or priority. Only the provided fields change. Does NOT re-apply the rule — call run_rule afterwards.",
      inputSchema: {
        ruleId: z.string(),
        name: z.string().optional(),
        conditions: z.array(ruleConditionSchema).optional(),
        categoryId: z.string().optional(),
        isActive: z.boolean().optional(),
        priority: z.number().int().optional(),
      },
    },
    async ({ ruleId, name, conditions, categoryId, isActive, priority }, extra) => {
      const userId = requireUserId(extra as ToolExtra);
      try {
        return json(
          await updateRuleForUser(userId, ruleId, {
            name,
            conditions,
            categoryId,
            isActive,
            priority,
          }),
        );
      } catch (err) {
        return errorResult(err, "update_rule failed");
      }
    },
  );

  // ── run_rule ──────────────────────────────────────────────────────────────────
  server.registerTool(
    "run_rule",
    {
      description:
        "Execute a rule now: categorize all matching transactions into the rule's target category (marks them RULE/APPROVED). Returns how many were categorized. Omit ruleId to run ALL active rules in priority order.",
      inputSchema: {
        ruleId: z.string().optional(),
      },
    },
    async ({ ruleId }, extra) => {
      const userId = requireUserId(extra as ToolExtra);
      try {
        if (ruleId) {
          return json({ categorized: await runRuleForUser(userId, ruleId) });
        }
        const results = await runAllRulesForUser(userId);
        return json({
          rulesRun: results.length,
          totalCategorized: results.reduce((s, r) => s + r.categorized, 0),
          perRule: results,
        });
      } catch (err) {
        return errorResult(err, "run_rule failed");
      }
    },
  );
}
