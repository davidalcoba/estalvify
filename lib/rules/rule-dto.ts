// Types and DTOs for transaction categorization rules

// ─────────────────────────────────────────────
// Condition model
// ─────────────────────────────────────────────

/**
 * `any` matches against description + remittanceInfo together. It is the default:
 * a user rule shouldn't have to know which of the two fields the text landed in.
 *
 * Both carry signal, and which one is useful depends on the transaction
 * (see `parseRemittanceFields` for how they are split):
 * - `description` holds the merchant — "PAGO CON TARJETA CONDIS TRES SENYORES…"
 * - `remittanceInfo` holds the bank's own label. For BBVA card payments that is a
 *   merchant *category* — "PAGO CON TARJETA EN SUPERMERCADOS", "…EN RESTAURANTES
 *   Y CAFETERIAS" — which is often a better rule target than the merchant name,
 *   because it covers merchants you have never seen before. For other operations
 *   it is coarse ("ADEUDO A SU CARGO", "TRANSFERENCIAS", "BIZUM") and the
 *   merchant has to come from `description`.
 */
export type RuleConditionField =
  | "any"
  | "description"
  | "remittanceInfo"
  | "amount"
  | "direction"
  | "account";

export type RuleConditionOperator =
  | "contains"
  | "equals"
  | "startsWith"
  | "endsWith"
  | "word" // whole-word match — wraps the escaped value in \b…\b
  | "matches" // raw regex, validated when the rule is saved
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between";

export type RuleConditionValue = string | number | [number, number];

export interface RuleCondition {
  field: RuleConditionField;
  operator: RuleConditionOperator;
  value: RuleConditionValue;
  negate?: boolean;
}

export type ConditionGroupOp = "AND" | "OR";

export interface ConditionGroup {
  op: ConditionGroupOp;
  children: ConditionNode[];
}

export type ConditionNode = ConditionGroup | RuleCondition;

export function isConditionGroup(node: ConditionNode): node is ConditionGroup {
  return "op" in node && Array.isArray((node as ConditionGroup).children);
}

// ─────────────────────────────────────────────
// Text normalization
// ─────────────────────────────────────────────

/**
 * Fold accents, upper-case and collapse whitespace. Applied to BOTH sides of
 * every text comparison so `AMORTIZACION` matches `AMORTIZACIÓN` and Catalan
 * spellings like `AIGÜES` are reachable without typing the diacritics.
 */
export function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

// ─────────────────────────────────────────────
// Parsing stored conditions
// ─────────────────────────────────────────────

/** Guard against pathological user-authored patterns reaching the regex engine. */
export const MAX_CONDITION_VALUE_LENGTH = 200;

const TEXT_OPERATOR_SET = new Set<RuleConditionOperator>([
  "contains",
  "equals",
  "startsWith",
  "endsWith",
  "word",
  "matches",
]);

const NUMERIC_OPERATOR_SET = new Set<RuleConditionOperator>([
  "equals",
  "gt",
  "gte",
  "lt",
  "lte",
  "between",
]);

function isRuleConditionLike(value: unknown): value is RuleCondition {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Record<string, unknown>;
  return typeof c.field === "string" && typeof c.operator === "string";
}

/**
 * Read the `conditions` JSON column into a condition tree.
 *
 * Rules created before the tree model stored a flat array joined with AND, so a
 * bare array is read as `{ op: "AND", children }`. This keeps existing rows
 * working without a data migration.
 */
export function parseConditions(raw: unknown): ConditionGroup {
  if (Array.isArray(raw)) {
    return { op: "AND", children: raw.filter(isRuleConditionLike) };
  }
  if (typeof raw === "object" && raw !== null && "op" in raw) {
    const group = raw as ConditionGroup;
    const op: ConditionGroupOp = group.op === "OR" ? "OR" : "AND";
    return { op, children: Array.isArray(group.children) ? group.children : [] };
  }
  if (isRuleConditionLike(raw)) {
    return { op: "AND", children: [raw] };
  }
  return { op: "AND", children: [] };
}

/** Every leaf condition in the tree, depth-first. Used for compact UI summaries. */
export function flattenConditions(node: ConditionNode): RuleCondition[] {
  if (!isConditionGroup(node)) return [node];
  return node.children.flatMap(flattenConditions);
}

// ─────────────────────────────────────────────
// Safety validation (ReDoS + unbounded structures)
// ─────────────────────────────────────────────

/**
 * The one-level editor produces depth 1. This cap is generous headroom, and its
 * only job is to stop a hand-crafted deeply-nested `conditions` JSON from
 * blowing the stack in the recursive matcher (`matchesNode`). Reachable from the
 * UI (`saveRule`) and over MCP (`create_rule`).
 */
export const MAX_CONDITION_DEPTH = 6;
/** Ceiling on total nodes so a giant flat array can't exhaust memory per match. */
export const MAX_CONDITION_NODES = 200;

/** Depth of the tree: a leaf is 0, a group is 1 + max child depth. */
export function conditionTreeDepth(node: ConditionNode): number {
  if (!isConditionGroup(node)) return 0;
  if (node.children.length === 0) return 1;
  return 1 + Math.max(...node.children.map(conditionTreeDepth));
}

/** Total number of nodes (groups + leaves) in the tree. */
export function countConditionNodes(node: ConditionNode): number {
  if (!isConditionGroup(node)) return 1;
  return 1 + node.children.reduce((sum, c) => sum + countConditionNodes(c), 0);
}

/**
 * Conservative guard against catastrophic backtracking (ReDoS). Node offers no
 * regex timeout, and the `matches` operator runs a user-authored pattern in
 * memory over every transaction, so an exponential pattern hangs the whole
 * serverless invocation. We reject the classic trigger: an unbounded quantifier
 * (`*`, `+`, `{n,}`) applied to a group that itself already contains an
 * unbounded quantifier — `(a+)+`, `(a*)*`, `((x)+)*`, etc.
 *
 * This does not prove a pattern safe (e.g. `(a|a)+` slips through), but it
 * catches the exponential cases while leaving ordinary rule patterns untouched.
 * Escapes and character classes are skipped so `\(`, `\+` and `[a+]` are literal.
 */
export function hasNestedUnboundedQuantifier(source: string): boolean {
  // Each open group pushes a frame tracking whether it directly contains an
  // unbounded quantifier. On close, if the group had one AND is itself followed
  // by an unbounded quantifier, that is nesting → unsafe.
  const stack: { unbounded: boolean }[] = [];
  let topHadUnbounded = false; // for quantifiers at the current level
  let inClass = false;

  const isUnboundedAt = (i: number): boolean => {
    const ch = source[i];
    if (ch === "*" || ch === "+") return true;
    if (ch === "{") {
      // {n,}  → unbounded ;  {n} / {n,m} → bounded
      const close = source.indexOf("}", i);
      if (close === -1) return false;
      const body = source.slice(i + 1, close);
      return /^\d*,\s*$/.test(body) || /^,\s*$/.test(body);
    }
    return false;
  };

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === "\\") {
      i++; // skip the escaped char
      continue;
    }
    if (inClass) {
      if (ch === "]") inClass = false;
      continue;
    }
    if (ch === "[") {
      inClass = true;
      continue;
    }
    if (ch === "(") {
      stack.push({ unbounded: false });
      continue;
    }
    if (ch === ")") {
      const frame = stack.pop();
      const groupHadUnbounded = frame?.unbounded ?? false;
      // Is the group quantified, and unboundedly so?
      let j = i + 1;
      if (source[j] === "?") j++; // lazy/greedy marker doesn't change the base op
      if (isUnboundedAt(j) && groupHadUnbounded) return true;
      // Propagate: a quantified group counts as a repetition in its parent.
      if (isUnboundedAt(j)) {
        if (stack.length > 0) stack[stack.length - 1].unbounded = true;
        else topHadUnbounded = true;
      }
      continue;
    }
    if (isUnboundedAt(i)) {
      if (stack.length > 0) stack[stack.length - 1].unbounded = true;
      else topHadUnbounded = true;
    }
  }

  void topHadUnbounded;
  return false;
}

/** A regex source is acceptable when it is short enough, compiles, and has no
 * nested unbounded quantifier. Used both to refuse a bad rule at save time and
 * to skip a bad pattern at match time. */
export function isSafeRegexSource(source: string): boolean {
  if (source.length > MAX_CONDITION_VALUE_LENGTH) return false;
  if (hasNestedUnboundedQuantifier(source)) return false;
  try {
    new RegExp(source, "i");
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate a condition tree before it is stored. Pure and unit-tested so the one
 * place that decides what a rule may contain is not buried in a server action.
 * The UI action and the MCP path both go through this.
 */
export function validateConditionTree(
  group: ConditionGroup
): { ok: true } | { ok: false; error: string } {
  if (conditionTreeDepth(group) > MAX_CONDITION_DEPTH) {
    return { ok: false, error: "Rule conditions are nested too deeply." };
  }
  if (countConditionNodes(group) > MAX_CONDITION_NODES) {
    return { ok: false, error: "Rule has too many conditions." };
  }
  for (const leaf of flattenConditions(group)) {
    const { value, operator } = leaf;
    if (typeof value === "string" && value.length > MAX_CONDITION_VALUE_LENGTH) {
      return { ok: false, error: "A condition value is too long." };
    }
    if (operator === "matches" && typeof value === "string") {
      if (!isSafeRegexSource(value)) {
        return {
          ok: false,
          error: "A regex condition is invalid or too expensive to run.",
        };
      }
    }
  }
  return { ok: true };
}

/** Throwing wrapper for the server-action path, which propagates plain errors. */
export function assertValidConditionTree(group: ConditionGroup): void {
  const result = validateConditionTree(group);
  if (!result.ok) throw new Error(result.error);
}

/** True when the tree has a nested group — i.e. the one-level editor can't represent it. */
export function isNestedTree(group: ConditionGroup): boolean {
  return group.children.some(isConditionGroup);
}

// ─────────────────────────────────────────────
// DTO
// ─────────────────────────────────────────────

export interface CategoryRuleDTO {
  id: string;
  name: string;
  /** Flattened leaf conditions — for compact rendering in the rule list. */
  conditions: RuleCondition[];
  /** Full tree, for the editor. */
  conditionTree: ConditionGroup;
  /** How the top-level conditions combine. */
  match: ConditionGroupOp;
  /** True when the tree is nested, so the one-level editor renders read-only. */
  isNested: boolean;
  sourceCategoryId: string | null;
  sourceCategoryName: string | null;
  sourceCategoryColor: string | null;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  /** False = disabled: the rule is kept but never runs. */
  isActive: boolean;
  matchCount: number;
  lastRunAt: string | null;
  lastMatchAt: string | null;
  /** Has run and caught nothing — usually the wrong field or a too-narrow word. */
  neverMatched: boolean;
  createdAt: string;
}

// Labels for UI rendering

export const FIELD_LABELS: Record<RuleConditionField, string> = {
  any: "Any text",
  description: "Description",
  remittanceInfo: "Reference",
  amount: "Amount",
  direction: "Direction",
  account: "Account",
};

export const OPERATOR_LABELS: Record<RuleConditionOperator, string> = {
  contains: "contains",
  equals: "is",
  startsWith: "starts with",
  endsWith: "ends with",
  word: "has the word",
  matches: "matches regex",
  gt: "greater than",
  gte: "at least",
  lt: "less than",
  lte: "at most",
  between: "between",
};

export const TEXT_OPERATORS: RuleConditionOperator[] = [
  "contains",
  "word",
  "equals",
  "startsWith",
  "endsWith",
  "matches",
];

export const NUMERIC_OPERATORS: RuleConditionOperator[] = [
  "equals",
  "gt",
  "gte",
  "lt",
  "lte",
  "between",
];

export const DIRECTION_OPERATORS: RuleConditionOperator[] = ["equals"];

export function getOperatorsForField(
  field: RuleConditionField
): RuleConditionOperator[] {
  if (field === "amount") return NUMERIC_OPERATORS;
  if (field === "direction") return DIRECTION_OPERATORS;
  return TEXT_OPERATORS;
}

export function getDefaultOperator(
  field: RuleConditionField
): RuleConditionOperator {
  if (field === "amount") return "between";
  if (field === "direction") return "equals";
  return "contains";
}

/** A value that fits the field, used when the editor switches field type. */
export function getDefaultValue(field: RuleConditionField): RuleConditionValue {
  if (field === "amount") return [0, 0];
  if (field === "direction") return "DEBIT";
  return "";
}

/**
 * Render a condition value for display. A range must be formatted explicitly —
 * React would otherwise concatenate the tuple into "5060".
 */
export function formatConditionValue(condition: RuleCondition): string {
  const { value } = condition;
  if (Array.isArray(value)) return `${value[0]} – ${value[1]}`;
  if (condition.field === "direction") {
    return value === "CREDIT" ? "money in" : "money out";
  }
  return String(value);
}

/**
 * True when a condition carries a usable value. Blank rows are dropped before
 * saving so a half-filled editor row never becomes a rule that matches nothing.
 */
export function hasConditionValue(condition: RuleCondition): boolean {
  const { value } = condition;
  if (Array.isArray(value)) {
    return value.length === 2 && value.every((v) => Number.isFinite(Number(v)));
  }
  if (typeof value === "number") return Number.isFinite(value);
  return value.trim() !== "";
}

export function isOperatorValidForField(
  field: RuleConditionField,
  operator: RuleConditionOperator
): boolean {
  if (field === "amount") return NUMERIC_OPERATOR_SET.has(operator);
  if (field === "direction") return operator === "equals";
  return TEXT_OPERATOR_SET.has(operator);
}

// Note: `priority` is deliberately absent from the view model. It only stores the
// rule's position in the list, and the list renders that position by ordering the
// rows — the number itself is never shown or edited.
export function toCategoryRuleDTO(rule: {
  id: string;
  name: string;
  conditions: unknown;
  sourceCategoryId: string | null;
  categoryId: string;
  isActive: boolean;
  matchCount: number;
  lastRunAt: Date | null;
  lastMatchAt: Date | null;
  createdAt: Date;
  category: { name: string; color: string };
  sourceCategory: { name: string; color: string } | null;
}): CategoryRuleDTO {
  const tree = parseConditions(rule.conditions);
  return {
    id: rule.id,
    name: rule.name,
    conditions: flattenConditions(tree),
    conditionTree: tree,
    match: tree.op,
    isNested: isNestedTree(tree),
    sourceCategoryId: rule.sourceCategoryId,
    sourceCategoryName: rule.sourceCategory?.name ?? null,
    sourceCategoryColor: rule.sourceCategory?.color ?? null,
    categoryId: rule.categoryId,
    categoryName: rule.category.name,
    categoryColor: rule.category.color,
    isActive: rule.isActive,
    matchCount: rule.matchCount,
    lastRunAt: rule.lastRunAt?.toISOString() ?? null,
    lastMatchAt: rule.lastMatchAt?.toISOString() ?? null,
    // matchCount only holds the most recent run's matches, so it can't say
    // "never" — a healthy rule with nothing new to claim would be flagged.
    neverMatched: rule.lastRunAt !== null && rule.lastMatchAt === null,
    createdAt: rule.createdAt.toISOString(),
  };
}
