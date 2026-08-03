import { describe, it, expect } from "vitest";
import {
  hasNestedUnboundedQuantifier,
  isSafeRegexSource,
  conditionTreeDepth,
  countConditionNodes,
  validateConditionTree,
  MAX_CONDITION_DEPTH,
  MAX_CONDITION_NODES,
  MAX_CONDITION_VALUE_LENGTH,
  type ConditionGroup,
  type RuleCondition,
} from "./rule-dto";

const leaf = (over: Partial<RuleCondition> = {}): RuleCondition => ({
  field: "description",
  operator: "contains",
  value: "MERCADONA",
  ...over,
});

describe("hasNestedUnboundedQuantifier", () => {
  it("flags the classic catastrophic patterns", () => {
    expect(hasNestedUnboundedQuantifier("(a+)+")).toBe(true);
    expect(hasNestedUnboundedQuantifier("(a*)*")).toBe(true);
    expect(hasNestedUnboundedQuantifier("(a+)*")).toBe(true);
    expect(hasNestedUnboundedQuantifier("((x)+)+")).toBe(true);
    expect(hasNestedUnboundedQuantifier("(a+)+$")).toBe(true);
    expect(hasNestedUnboundedQuantifier("(.*)*")).toBe(true);
    expect(hasNestedUnboundedQuantifier("(a{1,})+")).toBe(true);
  });

  it("leaves ordinary patterns alone", () => {
    expect(hasNestedUnboundedQuantifier("MERCADONA")).toBe(false);
    expect(hasNestedUnboundedQuantifier("^PAGO CON TARJETA")).toBe(false);
    expect(hasNestedUnboundedQuantifier("(SUPER|MERCA)DONA")).toBe(false);
    expect(hasNestedUnboundedQuantifier("a+b+c+")).toBe(false);
    expect(hasNestedUnboundedQuantifier("(ab)+")).toBe(false);
    // Bounded outer quantifier is not catastrophic.
    expect(hasNestedUnboundedQuantifier("(a+){1,3}")).toBe(false);
    // Escaped parens/quantifiers are literal.
    expect(hasNestedUnboundedQuantifier("\\(a\\+\\)\\+")).toBe(false);
    // Quantifier inside a character class is literal.
    expect(hasNestedUnboundedQuantifier("[a+]+")).toBe(false);
  });
});

describe("isSafeRegexSource", () => {
  it("accepts ordinary rule regexes", () => {
    expect(isSafeRegexSource("PAGO CON TARJETA")).toBe(true);
    expect(isSafeRegexSource("(SUPER|MERCA)")).toBe(true);
  });
  it("rejects nested-quantifier patterns", () => {
    expect(isSafeRegexSource("(a+)+$")).toBe(false);
  });
  it("rejects patterns that do not compile", () => {
    expect(isSafeRegexSource("(unterminated")).toBe(false);
  });
  it("rejects over-long patterns", () => {
    expect(isSafeRegexSource("a".repeat(MAX_CONDITION_VALUE_LENGTH + 1))).toBe(false);
  });
});

describe("conditionTreeDepth / countConditionNodes", () => {
  it("measures a flat group as depth 1", () => {
    const g: ConditionGroup = { op: "AND", children: [leaf(), leaf()] };
    expect(conditionTreeDepth(g)).toBe(1);
    expect(countConditionNodes(g)).toBe(3); // group + 2 leaves
  });
  it("measures nesting", () => {
    const g: ConditionGroup = {
      op: "AND",
      children: [leaf(), { op: "OR", children: [leaf(), leaf()] }],
    };
    expect(conditionTreeDepth(g)).toBe(2);
    expect(countConditionNodes(g)).toBe(5);
  });
});

describe("validateConditionTree", () => {
  it("accepts a normal rule", () => {
    const g: ConditionGroup = { op: "AND", children: [leaf()] };
    expect(validateConditionTree(g)).toEqual({ ok: true });
  });

  it("rejects a tree nested past the depth cap", () => {
    let node: ConditionGroup = { op: "AND", children: [leaf()] };
    for (let i = 0; i < MAX_CONDITION_DEPTH + 1; i++) {
      node = { op: "AND", children: [node] };
    }
    expect(validateConditionTree(node).ok).toBe(false);
  });

  it("rejects a tree with too many nodes", () => {
    const children = Array.from({ length: MAX_CONDITION_NODES + 1 }, () => leaf());
    const g: ConditionGroup = { op: "OR", children };
    expect(validateConditionTree(g).ok).toBe(false);
  });

  it("rejects a catastrophic regex condition", () => {
    const g: ConditionGroup = {
      op: "AND",
      children: [leaf({ operator: "matches", value: "(a+)+$" })],
    };
    const result = validateConditionTree(g);
    expect(result.ok).toBe(false);
  });

  it("accepts a safe regex condition", () => {
    const g: ConditionGroup = {
      op: "AND",
      children: [leaf({ operator: "matches", value: "^PAGO" })],
    };
    expect(validateConditionTree(g)).toEqual({ ok: true });
  });

  it("rejects an over-long text value", () => {
    const g: ConditionGroup = {
      op: "AND",
      children: [leaf({ value: "x".repeat(MAX_CONDITION_VALUE_LENGTH + 1) })],
    };
    expect(validateConditionTree(g).ok).toBe(false);
  });
});
