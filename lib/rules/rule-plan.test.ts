import { describe, it, expect } from "vitest";
import { planRun, sortRulesForRun } from "./rule-plan";
import type { PlannableRule, PlannableTransaction } from "./rule-plan";

function rule(overrides: Partial<PlannableRule> & { id: string }): PlannableRule {
  return {
    name: overrides.id,
    priority: 300,
    createdAt: new Date("2026-01-01"),
    categoryId: `cat-${overrides.id}`,
    sourceCategoryId: null,
    conditions: { op: "AND", children: [] },
    ...overrides,
  };
}

function tx(
  overrides: Partial<PlannableTransaction> & { id: string }
): PlannableTransaction {
  return {
    description: "",
    remittanceInfo: null,
    amount: 10,
    direction: "DEBIT",
    accountName: null,
    categoryId: null,
    source: null,
    isRejected: false,
    ...overrides,
  };
}

const contains = (value: string) => ({
  op: "OR" as const,
  children: [{ field: "any" as const, operator: "contains" as const, value }],
});

describe("sortRulesForRun", () => {
  it("orders by priority ascending — lower number first", () => {
    const sorted = sortRulesForRun([
      rule({ id: "c", priority: 300 }),
      rule({ id: "a", priority: 0 }),
      rule({ id: "b", priority: 200 }),
    ]);
    expect(sorted.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("breaks ties by createdAt ascending, not insertion order", () => {
    const sorted = sortRulesForRun([
      rule({ id: "newer", priority: 0, createdAt: new Date("2026-05-01") }),
      rule({ id: "older", priority: 0, createdAt: new Date("2026-01-01") }),
    ]);
    expect(sorted.map((r) => r.id)).toEqual(["older", "newer"]);
  });

  it("does not mutate its input", () => {
    const rules = [rule({ id: "b", priority: 300 }), rule({ id: "a", priority: 0 })];
    sortRulesForRun(rules);
    expect(rules.map((r) => r.id)).toEqual(["b", "a"]);
  });
});

describe("first match wins", () => {
  // The ordering case from the real data: ESCLATOIL contains ESCLAT, so fuel
  // must be evaluated before groceries.
  const fuel = rule({
    id: "fuel",
    priority: 310,
    categoryId: "cat-fuel",
    conditions: contains("ESCLATOIL"),
  });
  const groceries = rule({
    id: "groceries",
    priority: 320,
    categoryId: "cat-groceries",
    conditions: contains("ESCLAT"),
  });
  const esclatoil = tx({ id: "t1", description: "ESCLATOIL VILAFRANCA" });

  it("the lower-priority-number rule claims the transaction", () => {
    const plan = planRun([groceries, fuel], [esclatoil]);
    expect(plan.matches).toHaveLength(1);
    expect(plan.matches[0].ruleId).toBe("fuel");
    expect(plan.matches[0].categoryId).toBe("cat-fuel");
  });

  it("the later rule reports no match for an already-claimed transaction", () => {
    const plan = planRun([groceries, fuel], [esclatoil]);
    const byId = Object.fromEntries(plan.perRule.map((r) => [r.ruleId, r.matched]));
    expect(byId.fuel).toEqual(["t1"]);
    expect(byId.groceries).toEqual([]);
  });

  it("reversing the priorities reverses the winner", () => {
    const plan = planRun(
      [{ ...groceries, priority: 100 }, fuel],
      [esclatoil]
    );
    expect(plan.matches[0].ruleId).toBe("groceries");
  });
});

describe("conflicts", () => {
  const fuel = rule({ id: "fuel", priority: 310, conditions: contains("ESCLATOIL") });
  const groceries = rule({ id: "groceries", priority: 320, conditions: contains("ESCLAT") });

  it("are only collected when asked, and list the winner first", () => {
    const rows = [tx({ id: "t1", description: "ESCLATOIL VILAFRANCA" })];

    expect(planRun([fuel, groceries], rows).conflicts).toEqual([]);

    const dry = planRun([fuel, groceries], rows, { collectConflicts: true });
    expect(dry.conflicts).toEqual([{ transactionId: "t1", ruleIds: ["fuel", "groceries"] }]);
  });

  it("reports the conflict even though first-match-wins already resolved it", () => {
    const dry = planRun([fuel, groceries], [tx({ id: "t1", description: "ESCLATOIL VILAFRANCA" })], {
      collectConflicts: true,
    });
    expect(dry.matches).toHaveLength(1);
    expect(dry.matches[0].ruleId).toBe("fuel");
  });

  it("ignores transactions matched by a single rule", () => {
    const plan = planRun([fuel], [tx({ id: "t1", description: "ESCLATOIL VILAFRANCA" })], {
      collectConflicts: true,
    });
    expect(plan.conflicts).toEqual([]);
  });
});

describe("manual categorization is protected", () => {
  const groceries = rule({ id: "groceries", categoryId: "cat-g", conditions: contains("LIDL") });
  const manual = tx({
    id: "t1",
    description: "LIDL VILAFRANCA",
    categoryId: "cat-other",
    source: "MANUAL",
  });

  it("is never overwritten by default", () => {
    const plan = planRun([groceries], [manual]);
    expect(plan.matches).toEqual([]);
    expect(plan.perRule[0].skippedManual).toBe(1);
  });

  it("is overwritten with force", () => {
    const plan = planRun([groceries], [manual], { force: true });
    expect(plan.matches).toHaveLength(1);
    expect(plan.perRule[0].skippedManual).toBe(0);
  });

  it("does not block a later rule from claiming the transaction", () => {
    // Skipping on MANUAL must not silently claim the row for the skipping rule.
    const other = rule({
      id: "other",
      priority: 400,
      categoryId: "cat-x",
      conditions: contains("LIDL"),
    });
    const plan = planRun([groceries, other], [manual]);
    expect(plan.matches).toEqual([]);
    expect(plan.perRule.every((r) => r.matched.length === 0)).toBe(true);
  });

  it("still overwrites RULE and AI categorizations", () => {
    const rows = [
      tx({ id: "t1", description: "LIDL", categoryId: "cat-old", source: "RULE" }),
      tx({ id: "t2", description: "LIDL", categoryId: "cat-old", source: "AI" }),
    ];
    const plan = planRun([groceries], rows);
    expect(plan.matches.map((m) => m.transactionId)).toEqual(["t1", "t2"]);
  });
});

describe("undo trail", () => {
  it("records the previous category and source", () => {
    const groceries = rule({ id: "g", categoryId: "cat-new", conditions: contains("LIDL") });
    const rows = [
      tx({ id: "t1", description: "LIDL", categoryId: "cat-old", source: "RULE" }),
      tx({ id: "t2", description: "LIDL" }),
    ];
    const plan = planRun([groceries], rows);

    expect(plan.matches[0]).toMatchObject({
      transactionId: "t1",
      previousCategoryId: "cat-old",
      previousSource: "RULE",
    });
    // A row the rule created has no previous state — undo deletes it.
    expect(plan.matches[1]).toMatchObject({
      transactionId: "t2",
      previousCategoryId: null,
      previousSource: null,
    });
  });
});

describe("onlyUncategorized (the sync auto-run)", () => {
  const groceries = rule({ id: "g", categoryId: "cat-new", conditions: contains("LIDL") });

  it("leaves already-categorized rows alone", () => {
    const rows = [
      tx({ id: "new", description: "LIDL" }),
      tx({ id: "done", description: "LIDL", categoryId: "cat-old", source: "RULE" }),
    ];
    const plan = planRun([groceries], rows, { onlyUncategorized: true });
    expect(plan.matches.map((m) => m.transactionId)).toEqual(["new"]);
  });

  it("treats a REJECTED categorization as uncategorized", () => {
    const rows = [
      tx({ id: "rejected", description: "LIDL", categoryId: "cat-old", source: "RULE", isRejected: true }),
    ];
    const plan = planRun([groceries], rows, { onlyUncategorized: true });
    expect(plan.matches).toHaveLength(1);
  });

  it("skips source-category rules, which need a pre-existing category", () => {
    const recat = rule({
      id: "recat",
      sourceCategoryId: "cat-utilities",
      categoryId: "cat-water",
      conditions: contains("AIGUES"),
    });
    const rows = [tx({ id: "t1", description: "AIGÜES", categoryId: "cat-utilities", source: "RULE" })];

    expect(planRun([recat], rows, { onlyUncategorized: true }).matches).toEqual([]);
    expect(planRun([recat], rows).matches).toHaveLength(1);
  });

  it("is idempotent — a second run over the result claims nothing new", () => {
    // Overlapping sync invocations and queue retries both re-trigger the run.
    const rows = [tx({ id: "t1", description: "LIDL" })];
    const first = planRun([groceries], rows, { onlyUncategorized: true });
    expect(first.matches).toHaveLength(1);

    const after = [tx({ id: "t1", description: "LIDL", categoryId: "cat-new", source: "RULE" })];
    expect(planRun([groceries], after, { onlyUncategorized: true }).matches).toEqual([]);
  });
});

describe("source-category (re-categorization) rules", () => {
  it("only match transactions currently in the source category", () => {
    const recat = rule({
      id: "recat",
      sourceCategoryId: "cat-utilities",
      categoryId: "cat-water",
      conditions: contains("AIGUES"),
    });
    const rows = [
      tx({ id: "in", description: "AIGUES BCN", categoryId: "cat-utilities", source: "RULE" }),
      tx({ id: "out", description: "AIGUES BCN", categoryId: "cat-other", source: "RULE" }),
      tx({ id: "none", description: "AIGUES BCN" }),
    ];
    const plan = planRun([recat], rows);
    expect(plan.matches.map((m) => m.transactionId)).toEqual(["in"]);
  });

  it("see the category assigned earlier in the same run, not the stale DB value", () => {
    const assign = rule({
      id: "assign",
      priority: 200,
      categoryId: "cat-utilities",
      conditions: contains("AIGUES"),
    });
    const recat = rule({
      id: "recat",
      priority: 500,
      sourceCategoryId: "cat-utilities",
      categoryId: "cat-water",
      conditions: contains("BCN"),
    });
    const rows = [tx({ id: "t1", description: "AIGUES BCN" })];

    const plan = planRun([assign, recat], rows);
    // `assign` claims it first, so `recat` is blocked by first-match-wins even
    // though the source category now matches — the documented consequence.
    expect(plan.matches).toHaveLength(1);
    expect(plan.matches[0].ruleId).toBe("assign");
  });

  it("do not overwrite a manual categorization either", () => {
    const recat = rule({
      id: "recat",
      sourceCategoryId: "cat-utilities",
      categoryId: "cat-water",
      conditions: contains("AIGUES"),
    });
    const rows = [
      tx({ id: "t1", description: "AIGUES", categoryId: "cat-utilities", source: "MANUAL" }),
    ];
    expect(planRun([recat], rows).matches).toEqual([]);
  });
});

describe("empty inputs", () => {
  it("no rules produces an empty plan", () => {
    expect(planRun([], [tx({ id: "t1" })])).toEqual({
      matches: [],
      perRule: [],
      conflicts: [],
    });
  });

  it("a rule with no conditions claims nothing", () => {
    const plan = planRun([rule({ id: "empty" })], [tx({ id: "t1", description: "LIDL" })]);
    expect(plan.matches).toEqual([]);
  });
});
