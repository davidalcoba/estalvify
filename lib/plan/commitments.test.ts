import { describe, it, expect } from "vitest";
import {
  resolveSavingsGoal,
  computeCommitments,
  splitVariableSpend,
  computeAvailable,
} from "./commitments";
import type { PlanItemInput } from "./plan-item";

const REF = { year: 2026, month: 8 };

const plan: PlanItemInput[] = [
  { direction: "CREDIT", categoryId: null, amount: 6009, cadence: "MONTHLY" },
  { direction: "CREDIT", categoryId: null, amount: 2253, cadence: "MONTHLY" },
  { direction: "DEBIT", categoryId: "housing", amount: 1389.17, cadence: "MONTHLY" },
  { direction: "DEBIT", categoryId: "housing", amount: 562.48, cadence: "MONTHLY" },
];

describe("resolveSavingsGoal", () => {
  it("a fixed amount wins over a percent", () => {
    expect(resolveSavingsGoal(8262, 800, 15)).toBe(800);
  });

  it("a percent applies to fixed income", () => {
    expect(resolveSavingsGoal(8262, null, 15)).toBe(1239.3);
  });

  it("no goal means zero", () => {
    expect(resolveSavingsGoal(8262, null, null)).toBe(0);
    expect(resolveSavingsGoal(8262, 0, 0)).toBe(0);
  });
});

describe("computeCommitments", () => {
  it("subtracts the savings goal before the variable budget exists", () => {
    const c = computeCommitments({
      planItems: plan,
      ref: REF,
      savingsGoalAmount: null,
      savingsGoalPercent: 15,
    });
    expect(c.fixedIncome).toBe(8262);
    expect(c.committedExpenses).toBe(1951.65);
    expect(c.savingsGoal).toBe(1239.3);
    expect(c.variableBudget).toBe(8262 - 1951.65 - 1239.3);
  });

  it("sinking contributions are one more commitment", () => {
    const c = computeCommitments({
      planItems: plan,
      ref: REF,
      savingsGoalAmount: 500,
      savingsGoalPercent: null,
      sinkingContribution: 200,
    });
    expect(c.variableBudget).toBe(8262 - 1951.65 - 500 - 200);
  });

  it("without a goal the variable budget is income minus commitments", () => {
    const c = computeCommitments({
      planItems: plan,
      ref: REF,
      savingsGoalAmount: null,
      savingsGoalPercent: null,
    });
    expect(c.savingsGoal).toBe(0);
    expect(c.variableBudget).toBe(8262 - 1951.65);
  });
});

describe("splitVariableSpend", () => {
  it("spend inside a category's planned limit is fixed, not variable", () => {
    const split = splitVariableSpend(
      { housing: 1389.17, hogar: 23.5, restaurants: 18.2 },
      { housing: 1951.65 }
    );
    expect(split.total).toBe(1430.87);
    expect(split.fixed).toBe(1389.17);
    expect(split.variable).toBe(41.7);
  });

  it("caps the fixed part at the limit — a hand-typed fixed item never double-counts", () => {
    // Rent planned at 1389.17 by hand; a rent rise charges 1450. The planned
    // 1389.17 was already subtracted as a commitment; only the 60.83 beyond
    // the limit drains the variable budget.
    const split = splitVariableSpend({ housing: 1450 }, { housing: 1389.17 });
    expect(split.fixed).toBe(1389.17);
    expect(split.variable).toBe(60.83);
  });

  it("everything is variable without plan limits", () => {
    const split = splitVariableSpend({ x: 10 }, {});
    expect(split.variable).toBe(10);
  });
});

describe("computeAvailable", () => {
  it("computes the single number with pace and per-day", () => {
    const a = computeAvailable({
      variableBudget: 3000,
      variableSpent: 1200,
      dayOfMonth: 10,
      daysInMonth: 30,
    });
    expect(a.available).toBe(1800);
    expect(a.expectedByNow).toBe(1000);
    expect(a.paceRatio).toBe(1.2);
    expect(a.daysLeft).toBe(20);
    expect(a.perDayLeft).toBe(90);
  });

  it("overdrawn: per-day goes to zero, available goes negative", () => {
    const a = computeAvailable({
      variableBudget: 500,
      variableSpent: 700,
      dayOfMonth: 20,
      daysInMonth: 31,
    });
    expect(a.available).toBe(-200);
    expect(a.perDayLeft).toBe(0);
  });

  it("no budget: pace is null rather than infinity", () => {
    const a = computeAvailable({
      variableBudget: 0,
      variableSpent: 100,
      dayOfMonth: 5,
      daysInMonth: 31,
    });
    expect(a.paceRatio).toBeNull();
  });
});
