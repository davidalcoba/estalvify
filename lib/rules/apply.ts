// The single place rules are executed. Both the MCP layer (lib/mcp/manage.ts)
// and the /rules server actions go through here, so run semantics can't drift
// between them.
//
// Loading and writing live here; the decisions live in rule-plan.ts (pure).

import { prisma } from "@/lib/prisma";
import { parseConditions } from "./rule-dto";
import type { ConditionGroup } from "./rule-dto";
import { buildRulePrefilterWhere } from "./rule-evaluator";
import { matchesNode } from "./rule-matcher";
import { planRun } from "./rule-plan";
import type {
  CategorizationSourceLike,
  PlannableRule,
  PlannableTransaction,
  RuleConflict,
} from "./rule-plan";

/** Transactions returned alongside counts so a dry run is reviewable. */
export const SAMPLE_SIZE = 5;

export interface RuleRunSample {
  id: string;
  date: string;
  amount: number;
  direction: "DEBIT" | "CREDIT";
  description: string | null;
  remittanceInfo: string | null;
}

export interface RuleRunResult {
  ruleId: string;
  name: string;
  priority: number;
  matched: number;
  skippedManual: number;
  sample: RuleRunSample[];
}

export interface RuleRunReport {
  dryRun: boolean;
  rulesRun: number;
  totalMatched: number;
  perRule: RuleRunResult[];
  /** Transactions more than one rule wanted. Only populated on a dry run. */
  conflicts: RuleConflict[];
}

export interface RunRulesOptions {
  /** Run only these rules. Omit to run every active rule. */
  ruleIds?: string[];
  /** Report what would happen without writing anything. */
  dryRun?: boolean;
  /** Overwrite MANUAL categorizations. Off by default. */
  force?: boolean;
  /** Only touch uncategorized rows. Used by the post-sync auto-run. */
  onlyUncategorized?: boolean;
}

// ─────────────────────────────────────────────
// Loading
// ─────────────────────────────────────────────

// Selected once and reused: matching needs amount/direction/text, while the
// rule preview maps the same rows through toTransactionListItemDTO.
const transactionSelect = {
  id: true,
  description: true,
  remittanceInfo: true,
  amount: true,
  currency: true,
  direction: true,
  valueDate: true,
  bankAccount: { select: { id: true, name: true } },
  categorization: {
    select: {
      categoryId: true,
      source: true,
      status: true,
      category: { select: { name: true, color: true } },
    },
  },
} as const;

export type LoadedTransaction = {
  id: string;
  description: string | null;
  remittanceInfo: string | null;
  amount: { toString(): string };
  currency: string;
  direction: "DEBIT" | "CREDIT";
  valueDate: Date;
  bankAccount: { id: string; name: string };
  categorization: {
    categoryId: string;
    source: CategorizationSourceLike;
    status: "PENDING" | "APPROVED" | "REJECTED";
    category: { name: string; color: string } | null;
  } | null;
};

function toPlannable(tx: LoadedTransaction): PlannableTransaction {
  return {
    id: tx.id,
    description: tx.description,
    remittanceInfo: tx.remittanceInfo,
    amount: Math.abs(Number(tx.amount)),
    direction: tx.direction,
    accountName: tx.bankAccount?.name ?? null,
    categoryId: tx.categorization?.categoryId ?? null,
    source: tx.categorization?.source ?? null,
    isRejected: tx.categorization?.status === "REJECTED",
  };
}

function toSample(tx: LoadedTransaction): RuleRunSample {
  return {
    id: tx.id,
    date: tx.valueDate.toISOString().slice(0, 10),
    amount: Number(tx.amount),
    direction: tx.direction,
    description: tx.description,
    remittanceInfo: tx.remittanceInfo,
  };
}

/**
 * Candidates are loaded once per run, not once per rule. Rules with a
 * sourceCategoryId are filtered in memory against the live in-run category
 * (see planRun), so the SQL prefilter only needs the user scope.
 */
async function loadCandidates(
  userId: string,
  onlyUncategorized: boolean
): Promise<LoadedTransaction[]> {
  return prisma.transaction.findMany({
    where: buildRulePrefilterWhere(userId, null, { onlyUncategorized }),
    select: transactionSelect,
    orderBy: { valueDate: "desc" },
  }) as unknown as Promise<LoadedTransaction[]>;
}

// ─────────────────────────────────────────────
// Running
// ─────────────────────────────────────────────

export async function runRules(
  userId: string,
  options: RunRulesOptions = {}
): Promise<RuleRunReport> {
  const { ruleIds, dryRun = false, force = false, onlyUncategorized = false } = options;

  const ruleRows = await prisma.categoryRule.findMany({
    where: {
      userId,
      isActive: true,
      ...(ruleIds ? { id: { in: ruleIds } } : {}),
    },
    select: {
      id: true,
      name: true,
      priority: true,
      createdAt: true,
      categoryId: true,
      sourceCategoryId: true,
      conditions: true,
    },
  });

  if (ruleRows.length === 0) {
    return { dryRun, rulesRun: 0, totalMatched: 0, perRule: [], conflicts: [] };
  }

  const rules: PlannableRule[] = ruleRows.map((r) => ({
    ...r,
    conditions: parseConditions(r.conditions),
  }));

  // A source-category rule needs to see rows that already have a category, so
  // the narrow uncategorized prefilter is only safe when no such rule is running.
  const hasSourceCategoryRule = rules.some(
    (r) => r.sourceCategoryId !== null
  );
  const transactions = await loadCandidates(
    userId,
    onlyUncategorized && !hasSourceCategoryRule
  );

  const byId = new Map(transactions.map((t) => [t.id, t]));
  const plan = planRun(rules, transactions.map(toPlannable), {
    force,
    onlyUncategorized,
    collectConflicts: dryRun,
  });

  if (!dryRun && plan.matches.length > 0) {
    await writeMatches(plan.matches);
  }
  if (!dryRun) {
    await recordMetrics(plan.perRule);
  }

  const perRule: RuleRunResult[] = plan.perRule.map((r) => ({
    ruleId: r.ruleId,
    name: r.name,
    priority: r.priority,
    matched: r.matched.length,
    skippedManual: r.skippedManual,
    sample: r.matched
      .slice(0, SAMPLE_SIZE)
      .map((id) => byId.get(id))
      .filter((t): t is LoadedTransaction => t !== undefined)
      .map(toSample),
  }));

  return {
    dryRun,
    rulesRun: perRule.length,
    totalMatched: plan.matches.length,
    perRule,
    conflicts: plan.conflicts,
  };
}

async function writeMatches(
  matches: {
    transactionId: string;
    ruleId: string;
    categoryId: string;
    previousCategoryId: string | null;
    previousSource: CategorizationSourceLike | null;
  }[]
): Promise<void> {
  const now = new Date();
  const created = matches.filter((m) => m.previousCategoryId === null);
  const updated = matches.filter((m) => m.previousCategoryId !== null);

  if (created.length > 0) {
    // skipDuplicates guards the transactionId unique constraint: overlapping
    // sync invocations can plan the same row concurrently.
    await prisma.transactionCategorization.createMany({
      data: created.map((m) => ({
        transactionId: m.transactionId,
        categoryId: m.categoryId,
        source: "RULE" as const,
        status: "APPROVED" as const,
        categoryRuleId: m.ruleId,
        approvedAt: now,
        categorizedAt: now,
        previousCategoryId: null,
        previousSource: null,
      })),
      skipDuplicates: true,
    });
  }

  // Each updated row carries its own previous state, so these can't be batched
  // into a single updateMany.
  for (const m of updated) {
    await prisma.transactionCategorization.update({
      where: { transactionId: m.transactionId },
      data: {
        categoryId: m.categoryId,
        source: "RULE",
        status: "APPROVED",
        categoryRuleId: m.ruleId,
        approvedAt: now,
        categorizedAt: now,
        rejectedAt: null,
        note: null,
        previousCategoryId: m.previousCategoryId,
        previousSource: m.previousSource,
      },
    });
  }
}

async function recordMetrics(
  perRule: { ruleId: string; matched: string[] }[]
): Promise<void> {
  const now = new Date();
  await Promise.all(
    perRule.map((r) =>
      prisma.categoryRule.update({
        where: { id: r.ruleId },
        data: {
          matchCount: r.matched.length,
          lastRunAt: now,
          ...(r.matched.length > 0 ? { lastMatchAt: now } : {}),
        },
      })
    )
  );
}

// ─────────────────────────────────────────────
// Ad-hoc evaluation (rule preview and test_rule)
// ─────────────────────────────────────────────

export interface EvaluateResult {
  matched: number;
  transactions: LoadedTransaction[];
}

/** Evaluate conditions without saving or applying anything. */
export async function evaluateConditions(
  userId: string,
  conditions: ConditionGroup,
  sourceCategoryId: string | null,
  limit: number
): Promise<EvaluateResult> {
  const rows = (await prisma.transaction.findMany({
    where: buildRulePrefilterWhere(userId, sourceCategoryId),
    select: transactionSelect,
    orderBy: [{ valueDate: "desc" }, { id: "asc" }],
  })) as unknown as LoadedTransaction[];

  const matched = rows.filter((row) => matchesNode(toPlannable(row), conditions));

  return { matched: matched.length, transactions: matched.slice(0, limit) };
}

export async function testConditions(
  userId: string,
  conditions: ConditionGroup,
  sourceCategoryId: string | null,
  limit: number
): Promise<{ matched: number; sample: RuleRunSample[] }> {
  const result = await evaluateConditions(userId, conditions, sourceCategoryId, limit);
  return { matched: result.matched, sample: result.transactions.map(toSample) };
}

// ─────────────────────────────────────────────
// Undo
// ─────────────────────────────────────────────

/**
 * Revert everything a rule has done: restore the category and source the row
 * held before, or delete the row when the rule created it.
 *
 * This reverts *all* of the rule's work, not just its most recent run — that is
 * the useful operation when a rule turns out to be misconfigured, and it avoids
 * having to model runs as entities.
 */
export async function undoRuleRun(
  userId: string,
  ruleId: string
): Promise<{ reverted: number; deleted: number; restored: number }> {
  const rule = await prisma.categoryRule.findUnique({
    where: { id: ruleId },
    select: { userId: true },
  });
  if (!rule || rule.userId !== userId) throw new Error("Rule not found");

  const rows = await prisma.transactionCategorization.findMany({
    where: { categoryRuleId: ruleId, transaction: { userId } },
    select: {
      id: true,
      previousCategoryId: true,
      previousSource: true,
    },
  });
  if (rows.length === 0) return { reverted: 0, deleted: 0, restored: 0 };

  const toDelete = rows.filter((r) => r.previousCategoryId === null);
  const toRestore = rows.filter((r) => r.previousCategoryId !== null);

  // A category deleted since the run can't be restored to — drop those rows
  // rather than fail the whole undo.
  const restorableIds = new Set(
    (
      await prisma.category.findMany({
        where: { id: { in: toRestore.map((r) => r.previousCategoryId as string) } },
        select: { id: true },
      })
    ).map((c) => c.id)
  );

  const orphaned = toRestore.filter(
    (r) => !restorableIds.has(r.previousCategoryId as string)
  );
  const restorable = toRestore.filter((r) =>
    restorableIds.has(r.previousCategoryId as string)
  );

  const deleteIds = [...toDelete, ...orphaned].map((r) => r.id);
  if (deleteIds.length > 0) {
    await prisma.transactionCategorization.deleteMany({
      where: { id: { in: deleteIds } },
    });
  }

  for (const row of restorable) {
    await prisma.transactionCategorization.update({
      where: { id: row.id },
      data: {
        categoryId: row.previousCategoryId as string,
        source: row.previousSource ?? "MANUAL",
        categoryRuleId: null,
        previousCategoryId: null,
        previousSource: null,
      },
    });
  }

  return {
    reverted: rows.length,
    deleted: deleteIds.length,
    restored: restorable.length,
  };
}
