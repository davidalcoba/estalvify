import { describe, it, expect } from "vitest";
import {
  addDays,
  monthlyAnchorFor,
  scheduleSeries,
  projectAccountDaily,
  consolidateDaily,
  firstBreach,
  dailyVariableSpend,
} from "./cashflow";

describe("monthlyAnchorFor", () => {
  it("anchors a mortgage-style series to month end (31 Mar, 30 Apr, 31 May…)", () => {
    const anchor = monthlyAnchorFor([
      { date: "2026-03-31", amount: 562.48 },
      { date: "2026-04-30", amount: 562.48 },
      { date: "2026-05-31", amount: 562.48 },
      { date: "2026-06-30", amount: 562.48 },
      { date: "2026-07-31", amount: 562.48 },
    ]);
    expect(anchor).toEqual({ type: "MONTH_END" });
  });

  it("anchors a rent-style series to its median day (2, 6, 1, 1, 3 → day 2)", () => {
    const anchor = monthlyAnchorFor([
      { date: "2026-04-02", amount: 1389.17 },
      { date: "2026-05-06", amount: 1389.17 },
      { date: "2026-06-01", amount: 1389.17 },
      { date: "2026-07-01", amount: 1389.17 },
      { date: "2026-08-03", amount: 1389.17 },
    ]);
    expect(anchor).toEqual({ type: "DAY", day: 2 });
  });
});

describe("scheduleSeries", () => {
  it("schedules a month-end series once per calendar month, never zero or twice", () => {
    const dates = scheduleSeries(
      {
        cadence: "MONTHLY",
        history: [
          { date: "2026-06-30", amount: 562 },
          { date: "2026-07-31", amount: 562 },
        ],
        nextExpected: "2026-08-31",
      },
      "2026-08-03",
      "2026-10-02"
    );
    expect(dates).toEqual(["2026-08-31", "2026-09-30"]);
  });

  it("clamps an overdue charge to tomorrow instead of dropping it", () => {
    const dates = scheduleSeries(
      {
        cadence: "MONTHLY",
        history: [
          { date: "2026-06-01", amount: 1389 },
          { date: "2026-07-01", amount: 1389 },
        ],
        nextExpected: "2026-08-01",
      },
      "2026-08-03",
      "2026-09-15"
    );
    expect(dates).toEqual(["2026-08-04", "2026-09-01"]);
  });

  it("steps weekly series by 7 days from nextExpected", () => {
    const dates = scheduleSeries(
      { cadence: "WEEKLY", history: [], nextExpected: "2026-08-05" },
      "2026-08-03",
      "2026-08-20"
    );
    expect(dates).toEqual(["2026-08-05", "2026-08-12", "2026-08-19"]);
  });

  it("keeps a yearly series to a single occurrence in a 60-day window", () => {
    const dates = scheduleSeries(
      { cadence: "YEARLY", history: [], nextExpected: "2026-09-01" },
      "2026-08-03",
      "2026-10-02"
    );
    expect(dates).toEqual(["2026-09-01"]);
  });
});

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
