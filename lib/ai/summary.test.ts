import { describe, it, expect } from "vitest";
import { buildFinancialSummary, summaryToPrompt, type SummaryInputs } from "./summary";

function inputs(overrides: Partial<SummaryInputs> = {}): SummaryInputs {
  return {
    currency: "EUR",
    locale: "en-US",
    monthLabel: "August 2026",
    income: 2000,
    expenses: 1500.005,
    avgMonthlyNet: 250,
    netWorth: 8000,
    projectedBalanceEndOfHorizon: 9500,
    topCategories: [{ name: "Rent", amount: 800 }],
    budget: [{ name: "Food", planned: 300, spent: 320, status: "over" }],
    confirmedRecurringCount: 4,
    monthlyRecurringExpenses: 120,
    ...overrides,
  };
}

describe("buildFinancialSummary", () => {
  it("computes net and rounds amounts", () => {
    const summary = buildFinancialSummary(inputs());
    expect(summary.expenses).toBe(1500.01);
    expect(summary.net).toBe(499.99);
    expect(summary.income).toBe(2000);
  });

  it("preserves a null projection", () => {
    const summary = buildFinancialSummary(inputs({ projectedBalanceEndOfHorizon: null }));
    expect(summary.projectedBalanceEndOfHorizon).toBeNull();
  });

  it("carries category names and amounts (no raw transaction data)", () => {
    const summary = buildFinancialSummary(inputs());
    expect(summary.topCategories).toEqual([{ name: "Rent", amount: 800 }]);
  });
});

describe("summaryToPrompt", () => {
  it("renders formatted amounts and the budget/category sections", () => {
    const text = summaryToPrompt(buildFinancialSummary(inputs()), "en-US");
    expect(text).toContain("Month: August 2026");
    expect(text).toContain("Rent");
    expect(text).toContain("Food");
    expect(text).toContain("over");
    expect(text).toContain("Projected balance in 6 months");
  });

  it("omits the projection line when null", () => {
    const text = summaryToPrompt(
      buildFinancialSummary(inputs({ projectedBalanceEndOfHorizon: null })),
      "en-US"
    );
    expect(text).not.toContain("Projected balance in 6 months");
  });
});
