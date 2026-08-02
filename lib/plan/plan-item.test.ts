import { describe, it, expect } from "vitest";
import {
  isActiveInMonth,
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
    endDate: null,
    ...overrides,
  };
}

// Reference month for the "steady monthly" views.
const REF = { year: 2026, month: 8 };

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

  it("a periodic item contributes nothing after its end month", () => {
    const loan = item({ amount: 300, endDate: "2026-09-30" });
    expect(plannedForMonth(loan, 2026, 9)).toBe(-300);
    expect(plannedForMonth(loan, 2026, 10)).toBe(0);
  });
});

describe("isActiveInMonth", () => {
  it("is open-ended without an end date, and inclusive of the end month", () => {
    expect(isActiveInMonth(item({ endDate: null }), 2030, 1)).toBe(true);
    expect(isActiveInMonth(item({ endDate: "2026-08-31" }), 2026, 8)).toBe(true);
    // Inclusive: an item ending on the 5th still counts for the whole month.
    expect(isActiveInMonth(item({ endDate: "2026-08-05" }), 2026, 8)).toBe(true);
    expect(isActiveInMonth(item({ endDate: "2026-08-31" }), 2026, 9)).toBe(false);
    expect(isActiveInMonth(item({ endDate: "2026-12-31" }), 2027, 1)).toBe(false);
  });
});

describe("plannedMonthlyByCategory", () => {
  it("sums steady monthly expenses per category, excluding income and one-offs", () => {
    const totals = plannedMonthlyByCategory(
      [
        item({ categoryId: "housing", amount: 1200, cadence: "MONTHLY" }),
        item({ categoryId: "housing", amount: 600, cadence: "YEARLY" }), // +50/mo
        item({ categoryId: "transport", amount: 40, cadence: "MONTHLY" }),
        item({ categoryId: "transport", amount: 300, cadence: "ONE_OFF", onDate: "2026-09-01" }), // excluded
        item({ direction: "CREDIT", categoryId: "salary", amount: 2000 }), // income excluded
        item({ categoryId: null, amount: 10 }), // no category excluded
      ],
      REF
    );
    expect(totals).toEqual({ housing: 1250, transport: 40 });
  });

  it("drops items whose end date is before the reference month", () => {
    const totals = plannedMonthlyByCategory(
      [
        item({ categoryId: "housing", amount: 1200, endDate: "2026-07-31" }), // over
        item({ categoryId: "housing", amount: 300, endDate: "2026-08-10" }), // ends this month
        item({ categoryId: "gym", amount: 40, endDate: "2026-06-30" }), // over, drops the category
      ],
      REF
    );
    expect(totals).toEqual({ housing: 300 });
  });
});

describe("planTotals", () => {
  it("computes steady monthly income, expenses and net over periodic items", () => {
    const totals = planTotals(
      [
        item({ direction: "CREDIT", categoryId: null, amount: 2000, cadence: "MONTHLY" }),
        item({ amount: 1200, cadence: "MONTHLY" }),
        item({ amount: 120, cadence: "YEARLY" }), // +10/mo
        item({ amount: 500, cadence: "ONE_OFF", onDate: "2026-09-01" }), // excluded
      ],
      REF
    );
    expect(totals.monthlyIncome).toBe(2000);
    expect(totals.monthlyExpenses).toBe(1210);
    expect(totals.monthlyNet).toBe(790);
  });

  it("stops counting an item once its end date has passed", () => {
    const items = [
      item({ direction: "CREDIT", categoryId: null, amount: 2000 }),
      item({ amount: 300, endDate: "2026-08-31" }), // a loan's last payment
    ];
    expect(planTotals(items, REF).monthlyExpenses).toBe(300);
    expect(planTotals(items, { year: 2026, month: 9 }).monthlyExpenses).toBe(0);
    expect(planTotals(items, { year: 2026, month: 9 }).monthlyNet).toBe(2000);
  });
});
