import { describe, it, expect } from "vitest";
import {
  mergeRecurring,
  monthlyEquivalent,
  summarizeRecurring,
  type RecurringItem,
} from "./recurring-dto";
import type { RecurringCandidate } from "./detect";

function candidate(overrides: Partial<RecurringCandidate>): RecurringCandidate {
  return {
    merchantKey: "NETFLIX",
    displayName: "Netflix",
    direction: "DEBIT",
    cadence: "MONTHLY",
    occurrences: 3,
    averageAmount: 13.99,
    lastAmount: 13.99,
    firstSeen: "2026-01-05",
    lastSeen: "2026-03-05",
    nextExpected: "2026-04-05",
    categoryId: null,
    categoryName: null,
    categoryColor: null,
    ...overrides,
  };
}

describe("mergeRecurring", () => {
  it("defaults to SUGGESTED and overlays stored decisions by key", () => {
    const items = mergeRecurring(
      [
        candidate({ merchantKey: "NETFLIX" }),
        candidate({ merchantKey: "SPOTIFY" }),
        candidate({ merchantKey: "GYM" }),
      ],
      [
        { merchantKey: "SPOTIFY", status: "CONFIRMED" },
        { merchantKey: "GYM", status: "IGNORED" },
      ]
    );
    expect(items.map((i) => i.status)).toEqual(["SUGGESTED", "CONFIRMED", "IGNORED"]);
  });

  it("flags the series that already mirror a plan item", () => {
    const items = mergeRecurring(
      [candidate({ merchantKey: "NETFLIX" }), candidate({ merchantKey: "SPOTIFY" })],
      [
        { merchantKey: "NETFLIX", status: "CONFIRMED" },
        { merchantKey: "SPOTIFY", status: "CONFIRMED" },
      ],
      ["NETFLIX"]
    );
    expect(items.map((i) => i.inPlan)).toEqual([true, false]);
  });

  it("defaults inPlan to false when no plan links are given", () => {
    const items = mergeRecurring([candidate({})], []);
    expect(items[0].inPlan).toBe(false);
  });
});

describe("monthlyEquivalent", () => {
  it("normalizes each cadence to a monthly figure", () => {
    expect(monthlyEquivalent(12, "MONTHLY")).toBe(12);
    expect(monthlyEquivalent(120, "YEARLY")).toBe(10);
    expect(monthlyEquivalent(30, "QUARTERLY")).toBe(10);
    expect(monthlyEquivalent(12, "WEEKLY")).toBeCloseTo(52, 0);
  });
});

describe("summarizeRecurring", () => {
  it("totals confirmed monthly cost and counts suggestions", () => {
    const items: RecurringItem[] = [
      {
        ...candidate({ averageAmount: 13.99, cadence: "MONTHLY" }),
        status: "CONFIRMED",
        inPlan: true,
      },
      {
        ...candidate({ averageAmount: 120, cadence: "YEARLY" }),
        status: "CONFIRMED",
        inPlan: true,
      },
      {
        ...candidate({ direction: "CREDIT", averageAmount: 2000, cadence: "MONTHLY" }),
        status: "CONFIRMED",
        inPlan: true,
      },
      { ...candidate({ merchantKey: "NEW" }), status: "SUGGESTED", inPlan: false },
      { ...candidate({ merchantKey: "OLD" }), status: "IGNORED", inPlan: false },
    ];
    const summary = summarizeRecurring(items);
    expect(summary.monthlyExpenses).toBe(23.99); // 13.99 + 120/12
    expect(summary.monthlyIncome).toBe(2000);
    expect(summary.confirmedCount).toBe(3);
    expect(summary.suggestedCount).toBe(1);
  });
});
