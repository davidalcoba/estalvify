// Pure rule matching. No Prisma, no I/O — everything here is unit-testable.
//
// Matching moved out of SQL because accent folding, word boundaries, regex and
// the `any` field are not expressible in a Prisma `where` without the Postgres
// `unaccent` extension and raw queries. With ~1.5k transactions per user,
// evaluating in memory is cheap and lets dry run, `test_rule` and the UI preview
// all share one implementation.

import {
  isConditionGroup,
  normalizeText,
  MAX_CONDITION_VALUE_LENGTH,
  type ConditionNode,
  type RuleCondition,
  type RuleConditionField,
  type RuleConditionValue,
} from "./rule-dto";

export interface MatchableTransaction {
  description: string | null;
  remittanceInfo: string | null;
  /** Unsigned magnitude — the sign lives in `direction` (see lib/analytics/trends.ts). */
  amount: number;
  direction: "DEBIT" | "CREDIT";
  accountName: string | null;
}

// ─────────────────────────────────────────────
// Field access
// ─────────────────────────────────────────────

function textForField(
  tx: MatchableTransaction,
  field: RuleConditionField
): string {
  switch (field) {
    case "description":
      return normalizeText(tx.description);
    case "remittanceInfo":
      return normalizeText(tx.remittanceInfo);
    case "account":
      return normalizeText(tx.accountName);
    case "direction":
      return normalizeText(tx.direction);
    case "any":
    default:
      // Merchant names land in `description` and the operation type in
      // `remittanceInfo`, so `any` searches both without the user having to know.
      return normalizeText(`${tx.description ?? ""} ${tx.remittanceInfo ?? ""}`);
  }
}

// ─────────────────────────────────────────────
// Operators
// ─────────────────────────────────────────────

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Compile a pattern, returning null when it is invalid or over-long. A bad regex
 * makes its condition fail to match rather than throwing — one malformed rule
 * must not abort a run over every transaction.
 */
function compilePattern(source: string): RegExp | null {
  if (source.length > MAX_CONDITION_VALUE_LENGTH) return null;
  try {
    return new RegExp(source, "i");
  } catch {
    return null;
  }
}

/** `word` wraps the escaped value in word boundaries: `DIA` stops matching `CLAUDIA`. */
export function buildWordPattern(value: string): RegExp | null {
  return compilePattern(`\\b${escapeRegex(value)}\\b`);
}

export function isValidRegex(source: string): boolean {
  return compilePattern(source) !== null;
}

function toNumber(value: RuleConditionValue): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toRange(value: RuleConditionValue): [number, number] | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const [lo, hi] = [toNumber(value[0]), toNumber(value[1])];
  if (lo === null || hi === null) return null;
  return lo <= hi ? [lo, hi] : [hi, lo];
}

function matchNumeric(actual: number, condition: RuleCondition): boolean {
  if (condition.operator === "between") {
    const range = toRange(condition.value);
    if (!range) return false;
    return actual >= range[0] && actual <= range[1];
  }

  const target = toNumber(condition.value);
  if (target === null) return false;

  switch (condition.operator) {
    case "equals":
      return actual === target;
    case "gt":
      return actual > target;
    case "gte":
      return actual >= target;
    case "lt":
      return actual < target;
    case "lte":
      return actual <= target;
    default:
      return false;
  }
}

function matchText(haystack: string, condition: RuleCondition): boolean {
  const raw = typeof condition.value === "string" ? condition.value : "";
  if (condition.operator === "matches") {
    // The pattern is used as authored — normalizing it would upper-case escape
    // sequences (`\d` → `\D`) and change what it means. It runs case-insensitively
    // against the accent-folded haystack, so patterns are written without accents.
    const pattern = compilePattern(raw);
    return pattern ? pattern.test(haystack) : false;
  }
  if (condition.operator === "word") {
    const needleRaw = normalizeText(raw);
    if (!needleRaw) return false;
    const pattern = buildWordPattern(needleRaw);
    return pattern ? pattern.test(haystack) : false;
  }

  const needle = normalizeText(raw);
  if (!needle) return false;

  switch (condition.operator) {
    case "contains":
      return haystack.includes(needle);
    case "equals":
      return haystack === needle;
    case "startsWith":
      return haystack.startsWith(needle);
    case "endsWith":
      return haystack.endsWith(needle);
    default:
      return false;
  }
}

// ─────────────────────────────────────────────
// Condition + tree evaluation
// ─────────────────────────────────────────────

export function matchesCondition(
  tx: MatchableTransaction,
  condition: RuleCondition
): boolean {
  let result: boolean;

  if (condition.field === "amount") {
    // `amount` is stored unsigned, so comparisons are on magnitude. Use the
    // `direction` field to distinguish money in from money out.
    result = matchNumeric(tx.amount, condition);
  } else {
    result = matchText(textForField(tx, condition.field), condition);
  }

  return condition.negate ? !result : result;
}

/**
 * An empty group matches nothing. That is deliberate: a rule whose conditions
 * failed to parse must not silently claim every transaction.
 */
export function matchesNode(
  tx: MatchableTransaction,
  node: ConditionNode
): boolean {
  if (!isConditionGroup(node)) return matchesCondition(tx, node);
  if (node.children.length === 0) return false;

  return node.op === "OR"
    ? node.children.some((child) => matchesNode(tx, child))
    : node.children.every((child) => matchesNode(tx, child));
}
