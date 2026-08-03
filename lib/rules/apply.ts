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
import { isCompleteOrder } from "./rule-order";
import { chunk, planRun } from "./rule-plan";
import type {
  CategorizationSourceLike,
  PlannableRule,
  PlannedMatch,
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
  /** Already carried this exact categorization, so nothing was written. */
  unchanged: number;
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
      categoryRuleId: true,
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
    categoryRuleId: string | null;
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
    categoryRuleId: tx.categorization?.categoryRuleId ?? null,
    isRejected: tx.categorization?.status === "REJECTED",
    isApproved: tx.categorization?.status === "APPROVED",
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
  onlyUncategorized: boolean,
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
  options: RunRulesOptions = {},
): Promise<RuleRunReport> {
  const {
    ruleIds,
    dryRun = false,
    force = false,
    onlyUncategorized = false,
  } = options;

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
  const hasSourceCategoryRule = rules.some((r) => r.sourceCategoryId !== null);
  const transactions = await loadCandidates(
    userId,
    onlyUncategorized && !hasSourceCategoryRule,
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
    unchanged: r.unchanged,
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

async function writeMatches(matches: PlannedMatch[]): Promise<void> {
  const now = new Date();

  // Rows that already say exactly this are skipped entirely. Two reasons, and
  // the second is the important one:
  //   - a re-run over an unchanged ruleset would otherwise issue one UPDATE per
  //     categorized transaction, which is slow enough to time out;
  //   - it would also overwrite previousCategoryId with the rule's OWN previous
  //     result, so undo_rule_run would restore the intermediate state instead of
  //     what was there before the rule ever ran.
  const pending = matches.filter((m) => !m.unchanged);
  const created = pending.filter((m) => m.previousCategoryId === null);
  const updated = pending.filter((m) => m.previousCategoryId !== null);

  // skipDuplicates guards the transactionId unique constraint: overlapping
  // sync invocations can plan the same row concurrently.
  for (const batch of chunk(created)) {
    await prisma.transactionCategorization.createMany({
      data: batch.map((m) => ({
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

  // Rows sharing a target and a previous state can go in one statement, which
  // keeps a big re-categorization to a handful of round-trips.
  const groups = new Map<string, PlannedMatch[]>();
  for (const m of updated) {
    const key = `${m.ruleId}|${m.categoryId}|${m.previousCategoryId}|${m.previousSource}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(m);
    else groups.set(key, [m]);
  }

  for (const bucket of groups.values()) {
    const head = bucket[0];
    for (const batch of chunk(bucket)) {
      await prisma.transactionCategorization.updateMany({
        where: { transactionId: { in: batch.map((m) => m.transactionId) } },
        data: {
          categoryId: head.categoryId,
          source: "RULE",
          status: "APPROVED",
          categoryRuleId: head.ruleId,
          approvedAt: now,
          categorizedAt: now,
          rejectedAt: null,
          note: null,
          previousCategoryId: head.previousCategoryId,
          previousSource: head.previousSource,
        },
      });
    }
  }
}

async function recordMetrics(
  perRule: { ruleId: string; matched: string[] }[],
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
      }),
    ),
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
  limit: number,
): Promise<EvaluateResult> {
  const rows = (await prisma.transaction.findMany({
    where: buildRulePrefilterWhere(userId, sourceCategoryId),
    select: transactionSelect,
    orderBy: [{ valueDate: "desc" }, { id: "asc" }],
  })) as unknown as LoadedTransaction[];

  const matched = rows.filter((row) =>
    matchesNode(toPlannable(row), conditions),
  );

  return { matched: matched.length, transactions: matched.slice(0, limit) };
}

export async function testConditions(
  userId: string,
  conditions: ConditionGroup,
  sourceCategoryId: string | null,
  limit: number,
): Promise<{ matched: number; sample: RuleRunSample[] }> {
  const result = await evaluateConditions(
    userId,
    conditions,
    sourceCategoryId,
    limit,
  );
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
  ruleId: string,
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
        where: {
          id: { in: toRestore.map((r) => r.previousCategoryId as string) },
        },
        select: { id: true },
      })
    ).map((c) => c.id),
  );

  const orphaned = toRestore.filter(
    (r) => !restorableIds.has(r.previousCategoryId as string),
  );
  const restorable = toRestore.filter((r) =>
    restorableIds.has(r.previousCategoryId as string),
  );

  const deleteIds = [...toDelete, ...orphaned].map((r) => r.id);
  for (const batch of chunk(deleteIds)) {
    await prisma.transactionCategorization.deleteMany({
      where: { id: { in: batch } },
    });
  }

  // Grouped by the state being restored, so undoing a rule that categorized
  // hundreds of rows costs a few statements. Restoring row by row would time
  // out on exactly the rules most worth undoing.
  const restoreGroups = new Map<string, typeof restorable>();
  for (const row of restorable) {
    const key = `${row.previousCategoryId}|${row.previousSource}`;
    const bucket = restoreGroups.get(key);
    if (bucket) bucket.push(row);
    else restoreGroups.set(key, [row]);
  }

  for (const bucket of restoreGroups.values()) {
    const head = bucket[0];
    for (const batch of chunk(bucket)) {
      await prisma.transactionCategorization.updateMany({
        where: { id: { in: batch.map((r) => r.id) } },
        data: {
          categoryId: head.previousCategoryId as string,
          source: head.previousSource ?? "MANUAL",
          categoryRuleId: null,
          previousCategoryId: null,
          previousSource: null,
        },
      });
    }
  }

  return {
    reverted: rows.length,
    deleted: deleteIds.length,
    restored: restorable.length,
  };
}

/**
 * Delete a rule. Categorizations it produced are kept but detached
 * (categoryRuleId → null), which also means they can no longer be undone —
 * callers who might want the transactions back should undo first.
 */
export async function deleteRuleForUser(userId: string, ruleId: string) {
  const rule = await prisma.categoryRule.findUnique({
    where: { id: ruleId },
    select: { userId: true, name: true },
  });
  if (!rule || rule.userId !== userId) throw new Error("Rule not found");

  const { count } = await prisma.transactionCategorization.updateMany({
    where: { categoryRuleId: ruleId },
    data: {
      categoryRuleId: null,
      previousCategoryId: null,
      previousSource: null,
    },
  });

  await prisma.categoryRule.delete({ where: { id: ruleId } });

  return { id: ruleId, name: rule.name, detachedCategorizations: count };
}

// ── Order ─────────────────────────────────────────────────────────────────────
// A rule's position in the list is its precedence, and `priority` is only how
// that position is stored. Shared by the UI action and the MCP layer so the two
// can't drift on what "next" or "reordered" means.

/**
 * Position for a newly created rule: last. A new rule must not silently outrank
 * every existing one — first match wins, so landing at the top would let it
 * claim transactions the user already assigned elsewhere.
 */
export async function nextRulePriority(userId: string): Promise<number> {
  const last = await prisma.categoryRule.findFirst({
    where: { userId },
    orderBy: { priority: "desc" },
    select: { priority: true },
  });
  return last === null ? 0 : last.priority + 1;
}

/**
 * Persist a new order by renumbering contiguously from 0, in one transaction so
 * a partial write can't leave two rules fighting over the same position.
 * `orderedIds` must be every rule the user owns, exactly once — see
 * `isCompleteOrder`.
 */
export async function reorderRulesForUser(
  userId: string,
  orderedIds: string[]
): Promise<{ reordered: number }> {
  const owned = await prisma.categoryRule.findMany({
    where: { userId },
    select: { id: true },
  });

  if (!isCompleteOrder(orderedIds, owned.map((r) => r.id))) {
    throw new Error("Rule order must list every rule exactly once");
  }

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.categoryRule.update({ where: { id }, data: { priority: index } })
    )
  );

  return { reordered: orderedIds.length };
}
