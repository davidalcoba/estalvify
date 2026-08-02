import { describe, it, expect } from "vitest";
import { lastNMonths, forwardMonths, monthlyIncomeExpenses, topCategories } from "./trends";

describe("lastNMonths", () => {
  it("returns the trailing months oldest-first", () => {
    expect(lastNMonths(2026, 8, 3)).toEqual([
      { year: 2026, month: 6 },
      { year: 2026, month: 7 },
      { year: 2026, month: 8 },
    ]);
  });

  it("crosses the year boundary", () => {
    expect(lastNMonths(2026, 2, 4)).toEqual([
      { year: 2025, month: 11 },
      { year: 2025, month: 12 },
      { year: 2026, month: 1 },
      { year: 2026, month: 2 },
    ]);
  });
});

describe("forwardMonths", () => {
  it("returns the next months soonest-first, crossing the year", () => {
    expect(forwardMonths(2026, 11, 3)).toEqual([
      { year: 2026, month: 12 },
      { year: 2027, month: 1 },
      { year: 2027, month: 2 },
    ]);
  });
});

describe("monthlyIncomeExpenses", () => {
  it("buckets income and expenses per month", () => {
    const rows = [
      { amount: 2000, direction: "CREDIT" as const, valueDate: "2026-07-30" },
      { amount: 50, direction: "DEBIT" as const, valueDate: "2026-07-05" },
      { amount: 30, direction: "DEBIT" as const, valueDate: "2026-08-05" },
    ];
    const result = monthlyIncomeExpenses(rows, [
      { year: 2026, month: 7 },
      { year: 2026, month: 8 },
    ]);
    expect(result).toEqual([
      { year: 2026, month: 7, income: 2000, expenses: 50, net: 1950 },
      { year: 2026, month: 8, income: 0, expenses: 30, net: -30 },
    ]);
  });

  it("ignores rows outside the requested buckets", () => {
    const rows = [{ amount: 100, direction: "DEBIT" as const, valueDate: "2025-01-01" }];
    const result = monthlyIncomeExpenses(rows, [{ year: 2026, month: 8 }]);
    expect(result).toEqual([{ year: 2026, month: 8, income: 0, expenses: 0, net: 0 }]);
  });
});

describe("topCategories", () => {
  const categories = [
    { id: "food", name: "Food", color: "#f00" },
    { id: "rent", name: "Rent", color: "#0f0" },
  ];

  it("attaches metadata and sorts by amount desc", () => {
    const result = topCategories({ food: 150, rent: 800 }, categories, 6);
    expect(result).toEqual([
      { categoryId: "rent", name: "Rent", color: "#0f0", amount: 800 },
      { categoryId: "food", name: "Food", color: "#f00", amount: 150 },
    ]);
  });

  it("drops zero/negative spend and respects the limit", () => {
    const result = topCategories({ food: 150, rent: 0 }, categories, 1);
    expect(result).toEqual([{ categoryId: "food", name: "Food", color: "#f00", amount: 150 }]);
  });

  it("falls back to Uncategorized for unknown ids", () => {
    expect(topCategories({ ghost: 10 }, categories)[0]).toMatchObject({
      name: "Uncategorized",
      amount: 10,
    });
  });
});

describe("monthlyIncomeExpenses — transfers", () => {
  const buckets = [{ year: 2026, month: 4 }];

  it("ignores a TRANSFER on both sides of the ledger", () => {
    // The real case: a 15.000 € move between the user's own accounts arrives as
    // two rows and, split on direction alone, showed up as 15.000 of income AND
    // 15.000 of expenses in the same month.
    const rows = [
      { amount: 15000, direction: "DEBIT" as const, valueDate: "2026-04-29", categoryKind: "TRANSFER" as const },
      { amount: 15000, direction: "CREDIT" as const, valueDate: "2026-04-29", categoryKind: "TRANSFER" as const },
      { amount: 100, direction: "DEBIT" as const, valueDate: "2026-04-10", categoryKind: "EXPENSE" as const },
    ];
    const [april] = monthlyIncomeExpenses(rows, buckets);

    expect(april.income).toBe(0);
    expect(april.expenses).toBe(100);
    expect(april.net).toBe(-100);
  });

  it("still counts an uncategorized row by direction", () => {
    // Dropping these would understate every month — worse than the problem the
    // kind filter exists to solve.
    const rows = [
      { amount: 50, direction: "DEBIT" as const, valueDate: "2026-04-05", categoryKind: null },
      { amount: 200, direction: "CREDIT" as const, valueDate: "2026-04-06" },
    ];
    const [april] = monthlyIncomeExpenses(rows, buckets);

    expect(april.expenses).toBe(50);
    expect(april.income).toBe(200);
  });

  it("counts EXPENSE and INCOME normally", () => {
    const rows = [
      { amount: 30, direction: "DEBIT" as const, valueDate: "2026-04-05", categoryKind: "EXPENSE" as const },
      { amount: 900, direction: "CREDIT" as const, valueDate: "2026-04-06", categoryKind: "INCOME" as const },
    ];
    const [april] = monthlyIncomeExpenses(rows, buckets);

    expect(april.expenses).toBe(30);
    expect(april.income).toBe(900);
    expect(april.net).toBe(870);
  });
});
