import { describe, it, expect } from "vitest";
import {
  computeCascade,
  computeActualResult,
  performance,
  reconciliationGap,
  rolloverBalance,
  monthsOfCushion,
} from "./cascade";

describe("computeCascade (v3)", () => {
  it("reproduces the spec's cascade: the expected result IS the goal", () => {
    const c = computeCascade({
      plannedItems: [
        { direction: "CREDIT", amount: 6009 },
        { direction: "CREDIT", amount: 2253 },
        { direction: "DEBIT", amount: 2610 },
      ],
      rolloverQuotas: 285,
      variableBudget: 4567,
    });
    expect(c.expectedIncome).toBe(8262);
    expect(c.expectedResult).toBe(800);
  });

  it("always uses EXPECTED amounts — reality lands in performance, not the plan", () => {
    // The salary series expects 6.009; 20.528 arriving must not move the goal.
    const c = computeCascade({
      plannedItems: [{ direction: "CREDIT", amount: 6009 }],
      rolloverQuotas: 0,
      variableBudget: 0,
    });
    expect(c.expectedIncome).toBe(6009);
  });

  it("plan test #6: a 600 € one-off IBI planned in August lowers August's expected result", () => {
    const base = { rolloverQuotas: 0, variableBudget: 4567 };
    const without = computeCascade({ plannedItems: [{ direction: "CREDIT", amount: 8262 }], ...base });
    const withIbi = computeCascade({
      plannedItems: [
        { direction: "CREDIT", amount: 8262 },
        { direction: "DEBIT", amount: 600 },
      ],
      ...base,
    });
    expect(without.expectedResult - withIbi.expectedResult).toBe(600);
  });
});

describe("computeActualResult / performance", () => {
  it("accrual: matched items count at actual amounts in their budget month", () => {
    const r = computeActualResult({
      matchedCredit: 8262,
      matchedDebit: 2610.5,
      unmatchedCredit: 12,
      unmatchedDebit: 2900,
    });
    expect(r.actualResult).toBe(8262 + 12 - 2610.5 - 2900);
  });

  it("plan test #4: a salary sliding into the next calendar month doesn't wreck performance", () => {
    // Under accrual the matched salary still counts in its budget month, so
    // July's real income carries the 6.009 even if the bank dated it 1 Aug.
    const july = computeActualResult({
      matchedCredit: 8262,
      matchedDebit: 2610,
      unmatchedCredit: 0,
      unmatchedDebit: 4800,
    });
    expect(performance(july.actualResult, 800)).toBe(52);
  });
});

describe("reconciliationGap", () => {
  it("plan test #12: a gap between flows and balance change is SHOWN", () => {
    expect(reconciliationGap(900, 852)).toBe(48);
    expect(reconciliationGap(null, 852)).toBeNull();
  });
});

describe("rolloverBalance / monthsOfCushion", () => {
  it("accumulates assigned minus spent across months", () => {
    expect(
      rolloverBalance([
        { assigned: 50, spent: 0 },
        { assigned: 50, spent: 120 },
      ])
    ).toBe(-20);
  });

  it("cushion is consolidated balance over average spend", () => {
    expect(monthsOfCushion(47664, 7700)).toBe(6.2);
    expect(monthsOfCushion(null, 7700)).toBeNull();
    expect(monthsOfCushion(47664, 0)).toBeNull();
  });
});
