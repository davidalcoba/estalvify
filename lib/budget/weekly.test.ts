import { describe, it, expect } from "vitest";
import {
  isoDayOfWeek,
  isoWeekStart,
  computeWeeklyAvailable,
  weekOperations,
  weeklyOpsMedian,
  weekComposition,
  monthsOfCushion,
} from "./weekly";

describe("ISO week helpers", () => {
  it("Monday is 1, Sunday is 7", () => {
    expect(isoDayOfWeek("2026-08-03")).toBe(1); // Monday
    expect(isoDayOfWeek("2026-08-09")).toBe(7); // Sunday
  });
  it("week start is the Monday", () => {
    expect(isoWeekStart("2026-08-05")).toBe("2026-08-03");
    expect(isoWeekStart("2026-08-03")).toBe("2026-08-03");
  });
});

describe("computeWeeklyAvailable", () => {
  it("recalculated daily rate — underspending raises the rate by itself", () => {
    // 20 days left, 2.000 € remaining → 100 €/day. Spend nothing for 10 days:
    // 10 days left, still 2.000 € → 200 €/day. No carry-over logic anywhere.
    const early = computeWeeklyAvailable({
      variableBudget: 3000,
      variableSpentMonth: 1000,
      today: "2026-08-12", // Wednesday, 20 days left incl. today
      daysInMonth: 31,
    });
    expect(early.dailyRate).toBe(100);
    const later = computeWeeklyAvailable({
      variableBudget: 3000,
      variableSpentMonth: 1000,
      today: "2026-08-22", // 10 days left incl. today
      daysInMonth: 31,
    });
    expect(later.dailyRate).toBe(200);
  });

  it("acceptance #3: a week straddling August/September needs no special case", () => {
    // Monday 31 Aug: 1 day left of August; the daily rate covers it and the
    // formula never asks which month the rest of the week belongs to.
    const w = computeWeeklyAvailable({
      variableBudget: 3100,
      variableSpentMonth: 3000,
      today: "2026-08-31",
      daysInMonth: 31,
    });
    expect(w.dailyRate).toBe(100);
    expect(w.daysLeftInWeek).toBe(7);
    expect(w.availableThisWeek).toBe(700);
  });

  it("week days shrink toward Sunday", () => {
    const sunday = computeWeeklyAvailable({
      variableBudget: 3000,
      variableSpentMonth: 0,
      today: "2026-08-09",
      daysInMonth: 31,
    });
    expect(sunday.daysLeftInWeek).toBe(1);
  });
});

const week = [
  { date: "2026-08-03", amount: 12.4, categoryId: "food" },
  { date: "2026-08-04", amount: 3.2, categoryId: "food" },
  { date: "2026-08-05", amount: 41.0, categoryId: "rest" },
  { date: "2026-08-02", amount: 99.0, categoryId: "food" }, // previous week
];

describe("weekOperations / weekComposition", () => {
  it("counts only the current ISO week", () => {
    const ops = weekOperations(week, "2026-08-05");
    expect(ops.count).toBe(3);
    expect(ops.spent).toBe(56.6);
  });

  it("composition is informative, sorted by spend", () => {
    const comp = weekComposition(week, "2026-08-05");
    expect(comp[0]).toEqual({ categoryId: "rest", spent: 41, count: 1 });
    expect(comp[1]).toEqual({ categoryId: "food", spent: 15.6, count: 2 });
  });
});

describe("weeklyOpsMedian", () => {
  it("uses complete trailing weeks only", () => {
    const rows = [];
    // 3 ops/week for the 12 complete weeks before the current one.
    for (let w = 1; w <= 12; w++) {
      for (let i = 0; i < 3; i++) {
        const date = new Date(Date.parse("2026-08-03") - w * 7 * 86_400_000 + i * 86_400_000)
          .toISOString()
          .slice(0, 10);
        rows.push({ date, amount: 10, categoryId: null });
      }
    }
    // A noisy current week must not move the median.
    rows.push({ date: "2026-08-04", amount: 10, categoryId: null });
    expect(weeklyOpsMedian(rows, "2026-08-05")).toBe(3);
  });
});

describe("monthsOfCushion", () => {
  it("acceptance #7: moving 1.000 € out of savings lowers the months", () => {
    const before = monthsOfCushion(46265, 0, 7700);
    const after = monthsOfCushion(45265, 0, 7700);
    expect(before).toBe(6);
    expect(after).toBe(5.9);
  });

  it("rollover balances are already spoken for", () => {
    expect(monthsOfCushion(46265, 1500, 7700)).toBe(5.8);
  });

  it("null without a spend baseline", () => {
    expect(monthsOfCushion(46265, 0, 0)).toBeNull();
  });
});
