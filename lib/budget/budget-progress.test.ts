import { describe, it, expect } from "vitest";
import {
  budgetStatus,
  budgetPercent,
  buildBudgetRow,
  budgetTotals,
} from "./budget-progress";

describe("budgetStatus", () => {
  it("is ok well under the plan", () => {
    expect(budgetStatus(100, 50)).toBe("ok");
  });

  it("warns at or above 80% of the plan", () => {
    expect(budgetStatus(100, 80)).toBe("warning");
    expect(budgetStatus(100, 99)).toBe("warning");
  });

  it("is over once spending exceeds the plan", () => {
    expect(budgetStatus(100, 101)).toBe("over");
  });

  it("treats spending with no plan as over", () => {
    expect(budgetStatus(0, 10)).toBe("over");
    expect(budgetStatus(0, 0)).toBe("ok");
  });
});

describe("budgetPercent", () => {
  it("clamps to 0–100", () => {
    expect(budgetPercent(100, 50)).toBe(50);
    expect(budgetPercent(100, 250)).toBe(100);
    expect(budgetPercent(100, -5)).toBe(0);
  });

  it("returns 100 when spending with no plan, 0 otherwise", () => {
    expect(budgetPercent(0, 10)).toBe(100);
    expect(budgetPercent(0, 0)).toBe(0);
  });
});

describe("buildBudgetRow", () => {
  it("computes remaining, percent and status", () => {
    const row = buildBudgetRow(
      { categoryId: "food", categoryName: "Food", categoryColor: "#f00", planned: 200 },
      150
    );
    expect(row).toMatchObject({
      categoryId: "food",
      planned: 200,
      spent: 150,
      remaining: 50,
      percent: 75,
      status: "ok",
    });
  });
});

describe("budgetTotals", () => {
  it("aggregates planned and spent across rows", () => {
    const totals = budgetTotals([
      { planned: 200, spent: 150 },
      { planned: 100, spent: 120 },
    ]);
    expect(totals).toEqual({
      planned: 300,
      spent: 270,
      remaining: 30,
      percent: 90,
      status: "warning",
    });
  });

  it("is zeroed for an empty budget", () => {
    expect(budgetTotals([])).toEqual({
      planned: 0,
      spent: 0,
      remaining: 0,
      percent: 0,
      status: "ok",
    });
  });
});
