import { describe, it, expect } from "vitest";
import {
  planMonthlyEquivalent,
  plannedForMonth,
  plannedMonthlyByCategory,
  planTotals,
  type PlanItemInput,
} from "./plan-item";

function item(overrides: Partial<PlanItemInput>): PlanItemInput {
  return {
    direction: "DEBIT",
    categoryId: "food",
    amount: 100,
    cadence: "MONTHLY",
    onDate: null,
    ...overrides,
  };
}

describe("planMonthlyEquivalent", () => {
  it("normalizes periodic cadences and treats ONE_OFF as 0", () => {
    expect(planMonthlyEquivalent(100, "MONTHLY")).toBe(100);
    expect(planMonthlyEquivalent(120, "YEARLY")).toBe(10);
    expect(planMonthlyEquivalent(30, "QUARTERLY")).toBe(10);
    expect(planMonthlyEquivalent(12, "WEEKLY")).toBeCloseTo(52, 0);
    expect(planMonthlyEquivalent(500, "ONE_OFF")).toBe(0);
  });
});

describe("plannedForMonth", () => {
  it("periodic items contribute their monthly equivalent every month, signed", () => {
    // Yearly 120 expense → -10/month in any month.
    expect(plannedForMonth(item({ amount: 120, cadence: "YEARLY" }), 2026, 8)).toBe(-10);
    // Monthly income of 2000 → +2000.
    expect(
      plannedForMonth(item({ direction: "CREDIT", amount: 2000, categoryId: null }), 2026, 8)
    ).toBe(2000);
  });

  it("ONE_OFF only lands in the month of its date", () => {
    const oneOff = item({ amount: 500, cadence: "ONE_OFF", onDate: "2026-09-15" });
    expect(plannedForMonth(oneOff, 2026, 9)).toBe(-500);
    expect(plannedForMonth(oneOff, 2026, 8)).toBe(0);
    expect(plannedForMonth(oneOff, 2026, 10)).toBe(0);
  });

  it("ONE_OFF with no date contributes nothing", () => {
    expect(plannedForMonth(item({ cadence: "ONE_OFF", onDate: null }), 2026, 9)).toBe(0);
  });
});

describe("plannedMonthlyByCategory", () => {
  it("sums steady monthly expenses per category, excluding income and one-offs", () => {
    const totals = plannedMonthlyByCategory([
      item({ categoryId: "housing", amount: 1200, cadence: "MONTHLY" }),
      item({ categoryId: "housing", amount: 600, cadence: "YEARLY" }), // +50/mo
      item({ categoryId: "transport", amount: 40, cadence: "MONTHLY" }),
      item({ categoryId: "transport", amount: 300, cadence: "ONE_OFF", onDate: "2026-09-01" }), // excluded
      item({ direction: "CREDIT", categoryId: "salary", amount: 2000 }), // income excluded
      item({ categoryId: null, amount: 10 }), // no category excluded
    ]);
    expect(totals).toEqual({ housing: 1250, transport: 40 });
  });
});

describe("planTotals", () => {
  it("computes steady monthly income, expenses and net over periodic items", () => {
    const totals = planTotals([
      item({ direction: "CREDIT", categoryId: null, amount: 2000, cadence: "MONTHLY" }),
      item({ amount: 1200, cadence: "MONTHLY" }),
      item({ amount: 120, cadence: "YEARLY" }), // +10/mo
      item({ amount: 500, cadence: "ONE_OFF", onDate: "2026-09-01" }), // excluded
    ]);
    expect(totals.monthlyIncome).toBe(2000);
    expect(totals.monthlyExpenses).toBe(1210);
    expect(totals.monthlyNet).toBe(790);
  });
});
