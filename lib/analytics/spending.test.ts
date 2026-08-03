import { describe, it, expect } from "vitest";
import {
  monthRange,
  buildMonthlySpendingWhere,
  aggregateSpendingByCategory,
  currentYearMonth,
} from "./spending";

describe("monthRange", () => {
  it("returns a half-open UTC range for the month", () => {
    const { start, end } = monthRange(2026, 2);
    expect(start.toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });

  it("rolls over the year for December", () => {
    const { start, end } = monthRange(2026, 12);
    expect(start.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("buildMonthlySpendingWhere", () => {
  it("scopes by user and selects approved DEBIT transactions in the month", () => {
    const where = buildMonthlySpendingWhere("user-1", 2026, 5);
    expect(where.userId).toBe("user-1");
    expect(where.direction).toBe("DEBIT");
    expect(where.categorization).toEqual({
      is: { status: "APPROVED", category: { is: { kind: "EXPENSE" } } },
    });
    const valueDate = where.valueDate as { gte: Date; lt: Date };
    expect(valueDate.gte.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(valueDate.lt.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });

  it("restricts to one bank account when given, and to none when not", () => {
    expect(buildMonthlySpendingWhere("user-1", 2026, 5, "acc-1").bankAccountId).toBe(
      "acc-1"
    );
    expect(buildMonthlySpendingWhere("user-1", 2026, 5, "")).not.toHaveProperty(
      "bankAccountId"
    );
    expect(buildMonthlySpendingWhere("user-1", 2026, 5)).not.toHaveProperty(
      "bankAccountId"
    );
  });
});

describe("aggregateSpendingByCategory", () => {
  it("sums amounts per approved category", () => {
    const totals = aggregateSpendingByCategory([
      { amount: "10.00", categorization: { categoryId: "food" } },
      { amount: "5.50", categorization: { categoryId: "food" } },
      { amount: "20.00", categorization: { categoryId: "rent" } },
    ]);
    expect(totals).toEqual({ food: 15.5, rent: 20 });
  });

  it("ignores uncategorized rows and non-numeric amounts", () => {
    const totals = aggregateSpendingByCategory([
      { amount: "10.00", categorization: null },
      { amount: "not-a-number", categorization: { categoryId: "food" } },
      { amount: "3.00", categorization: { categoryId: "food" } },
    ]);
    expect(totals).toEqual({ food: 3 });
  });

  it("returns an empty object for no rows", () => {
    expect(aggregateSpendingByCategory([])).toEqual({});
  });
});

describe("currentYearMonth", () => {
  it("reads the calendar month in the given timezone", () => {
    // 2026-01-01T00:30 UTC is still 2025-12-31 in Los Angeles.
    const at = new Date("2026-01-01T00:30:00.000Z");
    expect(currentYearMonth("America/Los_Angeles", at)).toEqual({
      year: 2025,
      month: 12,
    });
    expect(currentYearMonth("Europe/Madrid", at)).toEqual({
      year: 2026,
      month: 1,
    });
  });
});

describe("buildMonthlySpendingWhere — kind", () => {
  it("restricts to EXPENSE categories", () => {
    // Without this, the outgoing leg of every savings transfer counted as
    // spending: one 15.000 € move was landing in the month's expenses.
    const where = buildMonthlySpendingWhere("user-1", 2026, 8);
    const categorization = where.categorization as {
      is: { category: { is: { kind: string } } };
    };
    expect(categorization.is.category.is.kind).toBe("EXPENSE");
  });
});
