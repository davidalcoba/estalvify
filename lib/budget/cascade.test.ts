import { describe, it, expect } from "vitest";
import { computeCascade, extraordinaryIncome, rolloverBalance } from "./cascade";

describe("computeCascade", () => {
  it("reproduces the spec's cascade", () => {
    const c = computeCascade({
      baseIncome: 8262,
      plannedItems: [
        { direction: "DEBIT", amount: 2610, matchedAmount: null, status: "PENDING" },
      ],
      rolloverQuotas: 235,
      savingsGoal: 800,
    });
    expect(c.variableBudget).toBe(4617);
  });

  it("a matched item counts at its ACTUAL amount", () => {
    const c = computeCascade({
      baseIncome: 8262,
      plannedItems: [
        { direction: "DEBIT", amount: 58, matchedAmount: 88.28, status: "MATCHED" },
      ],
      rolloverQuotas: 0,
      savingsGoal: 0,
    });
    expect(c.plannedCharges).toBe(88.28);
  });

  it("a MISSED bill is still owed and keeps reducing the variable", () => {
    const c = computeCascade({
      baseIncome: 8262,
      plannedItems: [
        { direction: "DEBIT", amount: 600, matchedAmount: null, status: "MISSED" },
      ],
      rolloverQuotas: 0,
      savingsGoal: 0,
    });
    expect(c.plannedCharges).toBe(600);
  });

  it("planned CREDIT items never enter (income is the configured base)", () => {
    const c = computeCascade({
      baseIncome: 8262,
      plannedItems: [
        { direction: "CREDIT", amount: 6009, matchedAmount: null, status: "PENDING" },
      ],
      rolloverQuotas: 0,
      savingsGoal: 0,
    });
    expect(c.plannedCharges).toBe(0);
    expect(c.variableBudget).toBe(8262);
  });

  it("acceptance #4: a 600 € one-off IBI reduces August's variable", () => {
    const without = computeCascade({
      baseIncome: 8262,
      plannedItems: [],
      rolloverQuotas: 0,
      savingsGoal: 800,
    });
    const withIbi = computeCascade({
      baseIncome: 8262,
      plannedItems: [
        { direction: "DEBIT", amount: 600, matchedAmount: null, status: "PENDING" },
      ],
      rolloverQuotas: 0,
      savingsGoal: 800,
    });
    expect(without.variableBudget - withIbi.variableBudget).toBe(600);
  });
});

describe("extraordinaryIncome", () => {
  it("is the excess over the base, by difference, no heuristics", () => {
    expect(extraordinaryIncome(22781, 8262)).toBe(14519);
    expect(extraordinaryIncome(8262, 8262)).toBe(0);
    expect(extraordinaryIncome(7000, 8262)).toBe(0);
  });
});

describe("rolloverBalance", () => {
  it("accumulates assigned minus spent across months", () => {
    expect(
      rolloverBalance([
        { assigned: 50, spent: 0 },
        { assigned: 50, spent: 0 },
        { assigned: 50, spent: 120 },
      ])
    ).toBe(30);
  });
});
