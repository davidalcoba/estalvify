import { describe, it, expect } from "vitest";
import {
  budgetNotifications,
  upcomingRecurringNotifications,
} from "./generators";
import type { BudgetRow } from "@/lib/budget/budget-progress";

function row(overrides: Partial<BudgetRow>): BudgetRow {
  return {
    categoryId: "food",
    categoryName: "Food",
    categoryColor: "#f00",
    planned: 100,
    spent: 50,
    remaining: 50,
    percent: 50,
    status: "ok",
    ...overrides,
  };
}

describe("budgetNotifications", () => {
  it("emits an over-budget warning with a stable dedupeKey", () => {
    const specs = budgetNotifications(
      2026,
      8,
      [row({ status: "over", planned: 100, spent: 130 })],
      "EUR",
      "en-US"
    );
    expect(specs).toHaveLength(1);
    expect(specs[0]).toMatchObject({
      type: "BUDGET_OVER",
      severity: "WARNING",
      dedupeKey: "budget-over:2026-8:food",
    });
    expect(specs[0].body).toContain("over");
  });

  it("emits a near-budget info alert", () => {
    const specs = budgetNotifications(
      2026,
      8,
      [row({ status: "warning", planned: 100, spent: 90, percent: 90 })],
      "EUR",
      "en-US"
    );
    expect(specs[0]).toMatchObject({
      type: "BUDGET_NEAR",
      severity: "INFO",
      dedupeKey: "budget-near:2026-8:food",
    });
  });

  it("ignores rows that are comfortably within budget", () => {
    expect(budgetNotifications(2026, 8, [row({ status: "ok" })], "EUR", "en-US")).toEqual([]);
  });
});

describe("upcomingRecurringNotifications", () => {
  const series = [
    {
      merchantKey: "NETFLIX",
      displayName: "Netflix",
      direction: "DEBIT" as const,
      averageAmount: 13.99,
      nextExpectedDate: "2026-08-05",
    },
  ];

  it("alerts when a charge is within the horizon", () => {
    const specs = upcomingRecurringNotifications(series, "2026-08-02", "EUR", "en-US", 5);
    expect(specs).toHaveLength(1);
    expect(specs[0]).toMatchObject({
      type: "RECURRING_UPCOMING",
      dedupeKey: "recurring-due:NETFLIX:2026-08-05",
    });
    expect(specs[0].body).toContain("in 3 days");
  });

  it("says 'today' / 'tomorrow' at the boundaries", () => {
    expect(
      upcomingRecurringNotifications(series, "2026-08-05", "EUR", "en-US")[0].body
    ).toContain("today");
    expect(
      upcomingRecurringNotifications(series, "2026-08-04", "EUR", "en-US")[0].body
    ).toContain("tomorrow");
  });

  it("skips charges outside the horizon or already past", () => {
    expect(upcomingRecurringNotifications(series, "2026-07-01", "EUR", "en-US", 5)).toEqual([]);
    expect(upcomingRecurringNotifications(series, "2026-08-10", "EUR", "en-US", 5)).toEqual([]);
  });

  it("skips series without a next expected date", () => {
    const noDate = [{ ...series[0], nextExpectedDate: null }];
    expect(upcomingRecurringNotifications(noDate, "2026-08-02", "EUR", "en-US")).toEqual([]);
  });
});
