import { describe, it, expect } from "vitest";
import {
  resolveSavingsGoal,
  computeCommitments,
  splitVariableSpend,
  computeAvailable,
} from "./commitments";
import { normalizeMerchantKey } from "@/lib/recurring/detect";
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
  it("keeps fixed charges out of the variable number", () => {
    const confirmed = new Set([normalizeMerchantKey("ALQUILER PISO BARCELONA", null)]);
    const split = splitVariableSpend(
      [
        { amount: 1389.17, description: "ALQUILER PISO BARCELONA", remittanceInfo: null },
        { amount: 23.5, description: "XINA CENTER", remittanceInfo: null },
        { amount: 18.2, description: "RESTAURANT CAN PEP", remittanceInfo: null },
      ],
      confirmed,
      normalizeMerchantKey
    );
    expect(split.total).toBe(1430.87);
    expect(split.fixed).toBe(1389.17);
    expect(split.variable).toBe(41.7);
  });

  it("handles no confirmed series", () => {
    const split = splitVariableSpend(
      [{ amount: 10, description: "X", remittanceInfo: null }],
      new Set(),
      normalizeMerchantKey
    );
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
