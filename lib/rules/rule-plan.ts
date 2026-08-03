// Pure planning for a rule run: given the rules and the candidate transactions,
// decide which rule claims which transaction. No Prisma, no I/O — lib/rules/apply.ts
// loads the data, calls this, and writes the result.

import { matchesNode } from "./rule-matcher";
import type { MatchableTransaction } from "./rule-matcher";
import type { ConditionGroup } from "./rule-dto";

export type CategorizationSourceLike = "RULE" | "AI" | "MANUAL";

/**
 * Rows per write statement, used by the writer in apply.ts. Bounded so a bulk
 * operation stays well inside Postgres' 65535 bind-parameter ceiling and inside
 * the request timeout — writes must be a handful of statements, never one per
 * transaction. Lives here so it stays testable without a database.
 */
export const WRITE_CHUNK = 500;

export function chunk<T>(items: T[], size = WRITE_CHUNK): T[][] {
  if (size < 1) throw new Error("chunk size must be at least 1");
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export interface PlannableRule {
  id: string;
  name: string;
  priority: number;
  createdAt: Date;
  categoryId: string;
  sourceCategoryId: string | null;
  conditions: ConditionGroup;
}

export interface PlannableTransaction extends MatchableTransaction {
  id: string;
  /** Current categorization, or null when the transaction has none. */
  categoryId: string | null;
  source: CategorizationSourceLike | null;
  /** Which rule owns the current categorization, if any. */
  categoryRuleId: string | null;
  /** REJECTED categorizations count as uncategorized, matching the categorize inbox. */
  isRejected: boolean;
  isApproved: boolean;
}

export interface PlannedMatch {
  transactionId: string;
  ruleId: string;
  categoryId: string;
  /** What the row held before, so the write can record an undo trail. */
  previousCategoryId: string | null;
  previousSource: CategorizationSourceLike | null;
  /**
   * The row already says exactly this. Re-writing it would be a no-op that
   * clobbers the undo trail with the rule's own previous result, so the caller
   * skips it — a re-run of an unchanged ruleset writes nothing.
   */
  unchanged: boolean;
}

export interface PlannedRuleResult {
  ruleId: string;
  name: string;
  priority: number;
  /** Transactions this rule claimed. */
  matched: string[];
  /** Of those, the ones that already carried this exact categorization. */
  unchanged: number;
  /** Matched but left alone because they were categorized manually. */
  skippedManual: number;
}

export interface RuleConflict {
  transactionId: string;
  /** Rule ids that also matched, in evaluation order — the winner comes first. */
  ruleIds: string[];
}

export interface PlanOptions {
  /** Overwrite MANUAL categorizations. Off by default: manual work is never lost. */
  force?: boolean;
  /** Skip rows that already have a categorization. Used by the sync auto-run. */
  onlyUncategorized?: boolean;
  /** Record every rule that would have matched, not just the winner. Dry run only. */
  collectConflicts?: boolean;
}

export interface RunPlan {
  matches: PlannedMatch[];
  perRule: PlannedRuleResult[];
  conflicts: RuleConflict[];
}

/**
 * Rules are evaluated in list order: `priority` ascending — it stores the rule's
 * 0-based position, so **earlier in the list runs first** — with `createdAt`
 * ascending as the tie-break, so the outcome never depends on database insertion
 * order.
 */
export function sortRulesForRun<T extends { priority: number; createdAt: Date }>(
  rules: T[]
): T[] {
  return [...rules].sort(
    (a, b) =>
      a.priority - b.priority || a.createdAt.getTime() - b.createdAt.getTime()
  );
}

function isUncategorized(tx: { categoryId: string | null; isRejected: boolean }) {
  return tx.categoryId === null || tx.isRejected;
}

/**
 * Plan a run.
 *
 * Semantics:
 * - **First match wins**: once a rule claims a transaction, later rules skip it.
 * - **MANUAL is never overwritten** without `force`. Precedence is
 *   MANUAL > RULE > AI > uncategorized.
 * - Category state is tracked **in memory** as the run progresses, so a
 *   re-categorization rule (one with `sourceCategoryId`) sees what an earlier
 *   rule assigned in this same run rather than the stale database value. Such a
 *   rule therefore has to sit **below** the one feeding it in the list.
 * - `onlyUncategorized` skips source-category rules entirely — they need a
 *   pre-existing category by definition.
 */
export function planRun(
  rules: PlannableRule[],
  transactions: PlannableTransaction[],
  options: PlanOptions = {}
): RunPlan {
  const { force = false, onlyUncategorized = false, collectConflicts = false } = options;

  // Working category state, mutated as rules claim transactions.
  const currentCategory = new Map<string, string | null>();
  const currentSource = new Map<string, CategorizationSourceLike | null>();
  for (const tx of transactions) {
    currentCategory.set(tx.id, tx.categoryId);
    currentSource.set(tx.id, tx.source);
  }

  const claimed = new Set<string>();
  const matches: PlannedMatch[] = [];
  const perRule: PlannedRuleResult[] = [];
  const alsoMatchedBy = new Map<string, string[]>();

  for (const rule of sortRulesForRun(rules)) {
    if (onlyUncategorized && rule.sourceCategoryId) continue;

    const matched: string[] = [];
    let skippedManual = 0;
    let unchangedCount = 0;

    for (const tx of transactions) {
      if (!matchesNode(tx, rule.conditions)) continue;

      // Source-category rules act on the live in-run category, not the DB value.
      if (rule.sourceCategoryId && currentCategory.get(tx.id) !== rule.sourceCategoryId) {
        continue;
      }
      if (onlyUncategorized && !isUncategorized({ categoryId: currentCategory.get(tx.id) ?? null, isRejected: tx.isRejected })) {
        continue;
      }

      if (collectConflicts) {
        const seen = alsoMatchedBy.get(tx.id);
        if (seen) seen.push(rule.id);
        else alsoMatchedBy.set(tx.id, [rule.id]);
      }

      if (claimed.has(tx.id)) continue;

      if (!force && currentSource.get(tx.id) === "MANUAL") {
        skippedManual++;
        continue;
      }

      // A transaction is claimed at most once per run, so its stored state here
      // is still the pre-run state and can be compared directly.
      const unchanged =
        tx.categoryId === rule.categoryId &&
        tx.source === "RULE" &&
        tx.categoryRuleId === rule.id &&
        tx.isApproved;
      if (unchanged) unchangedCount++;

      claimed.add(tx.id);
      matched.push(tx.id);
      matches.push({
        transactionId: tx.id,
        ruleId: rule.id,
        categoryId: rule.categoryId,
        previousCategoryId: currentCategory.get(tx.id) ?? null,
        previousSource: currentSource.get(tx.id) ?? null,
        unchanged,
      });
      currentCategory.set(tx.id, rule.categoryId);
      currentSource.set(tx.id, "RULE");
    }

    perRule.push({
      ruleId: rule.id,
      name: rule.name,
      priority: rule.priority,
      matched,
      unchanged: unchangedCount,
      skippedManual,
    });
  }

  const conflicts: RuleConflict[] = [];
  if (collectConflicts) {
    for (const [transactionId, ruleIds] of alsoMatchedBy) {
      if (ruleIds.length > 1) conflicts.push({ transactionId, ruleIds });
    }
  }

  return { matches, perRule, conflicts };
}
