import { describe, it, expect } from "vitest";
import {
  averageMonthly,
  projectBalances,
  projectMonthEndSpend,
  firstBelowThreshold,
} from "./forecast";
import type { MonthlyTotals } from "./trends";

function month(income: number, expenses: number): MonthlyTotals {
  return { year: 2026, month: 1, income, expenses, net: income - expenses };
}

describe("averageMonthly", () => {
  it("averages income, expenses and net", () => {
    expect(averageMonthly([month(2000, 1500), month(2000, 2500)])).toEqual({
      income: 2000,
      expenses: 2000,
      net: 0,
    });
  });

  it("is zeroed for no rows", () => {
    expect(averageMonthly([])).toEqual({ income: 0, expenses: 0, net: 0 });
  });
});

describe("projectBalances", () => {
  it("accumulates the average net onto the starting balance", () => {
    const result = projectBalances(1000, -300, [
      { year: 2026, month: 2 },
      { year: 2026, month: 3 },
      { year: 2026, month: 4 },
    ]);
    expect(result.map((r) => r.balance)).toEqual([700, 400, 100]);
  });
});

describe("projectMonthEndSpend", () => {
  it("extrapolates linearly from month-to-date", () => {
    expect(projectMonthEndSpend(300, 10, 30)).toBe(900);
  });

  it("returns the spend as-is when no days have elapsed", () => {
    expect(projectMonthEndSpend(50, 0, 30)).toBe(50);
  });
});

describe("firstBelowThreshold", () => {
  it("finds the earliest month under the threshold", () => {
    const projected = [
      { year: 2026, month: 2, balance: 500 },
      { year: 2026, month: 3, balance: -100 },
      { year: 2026, month: 4, balance: -700 },
    ];
    expect(firstBelowThreshold(projected, 0)).toEqual({ year: 2026, month: 3, balance: -100 });
  });

  it("returns null when all months stay above the threshold", () => {
    expect(firstBelowThreshold([{ year: 2026, month: 2, balance: 500 }], 0)).toBeNull();
  });
});
