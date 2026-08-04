import { describe, it, expect } from "vitest";
import {
  addDays,
  projectAccountDaily,
  consolidateDaily,
  firstBreach,
  dailyVariableSpend,
} from "./cashflow";

describe("projectAccountDaily", () => {
  it("detects the rent-before-salary squeeze the monthly view cannot see", () => {
    // Despeses on 3 Aug: 1398.50 in the account, rent 1389.17 due ~day 4,
    // salary 6009 arriving on the 28th. Monthly net is fine; the days are not.
    const projection = projectAccountDaily(
      {
        accountId: "despeses",
        accountName: "Despeses",
        startingBalance: 1398.5,
        dailyVariableSpend: 50,
        events: [
          { label: "Rent", direction: "DEBIT", amount: 1389.17, date: "2026-08-04" },
          { label: "Salary", direction: "CREDIT", amount: 6009, date: "2026-08-28" },
        ],
      },
      "2026-08-03",
      30
    );

    const breach = firstBreach(projection.points, 0);
    expect(breach).not.toBeNull();
    expect(breach!.date).toBe("2026-08-04");
    // Balance recovers after salary, but the minimum tells the real story.
    expect(projection.minBalance).toBeLessThan(0);
    expect(projection.points[projection.points.length - 1].balance).toBeGreaterThan(0);
  });

  it("applies daily variable spend every day", () => {
    const projection = projectAccountDaily(
      {
        accountId: "a",
        accountName: "A",
        startingBalance: 100,
        dailyVariableSpend: 10,
        events: [],
      },
      "2026-08-03",
      5
    );
    expect(projection.points.map((p) => p.balance)).toEqual([90, 80, 70, 60, 50]);
  });
});

describe("consolidateDaily", () => {
  it("sums accounts per day", () => {
    const a = projectAccountDaily(
      { accountId: "a", accountName: "A", startingBalance: 100, dailyVariableSpend: 10, events: [] },
      "2026-08-03",
      2
    );
    const b = projectAccountDaily(
      { accountId: "b", accountName: "B", startingBalance: 50, dailyVariableSpend: 0, events: [] },
      "2026-08-03",
      2
    );
    expect(consolidateDaily([a, b])).toEqual([
      { date: "2026-08-04", balance: 140 },
      { date: "2026-08-05", balance: 130 },
    ]);
  });

  it("returns empty for no accounts", () => {
    expect(consolidateDaily([])).toEqual([]);
  });
});

describe("dailyVariableSpend", () => {
  it("removes scheduled recurring spend so it is not counted twice", () => {
    expect(dailyVariableSpend(9000, 4500, 90)).toBe(50);
  });

  it("never goes negative", () => {
    expect(dailyVariableSpend(100, 500, 90)).toBe(0);
  });
});

describe("addDays", () => {
  it("crosses month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
  });
});
