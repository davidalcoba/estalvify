import { describe, it, expect } from "vitest";
import {
  isoDayOfWeek,
  isoWeekStart,
  isoWeekEnd,
  computeWeeklyAvailable,
  weekOperations,
  weeklyOpsMedian,
  weekComposition,
  weeklyHeadline,
  monthMeter,
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
  it("week end is the Sunday, and a month boundary is not a special case", () => {
    expect(isoWeekEnd("2026-08-05")).toBe("2026-08-09");
    expect(isoWeekEnd("2026-08-09")).toBe("2026-08-09");
    expect(isoWeekEnd("2026-08-31")).toBe("2026-09-06");
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

describe("weeklyHeadline", () => {
  const base = { remainingMonth: 400, dailyRate: 28.57, daysLeftInWeek: 3, availableThisWeek: 85.71 };

  it("hands over the allowance while the month still has budget", () => {
    expect(weeklyHeadline(base)).toEqual({
      kind: "available",
      amount: 85.71,
      daysLeftInWeek: 3,
      dailyRate: 28.57,
    });
  });

  it("never reports a negative allowance — past the budget there is nothing to spend", () => {
    // The screenshot case: the month is 248,16 € over, so the daily rate and
    // the week's figure both come out negative.
    const over = weeklyHeadline({
      remainingMonth: -248.16,
      dailyRate: -15.51,
      daysLeftInWeek: 1,
      availableThisWeek: -15.51,
    });
    expect(over).toEqual({ kind: "exhausted", overspent: 248.16, daysLeftInWeek: 1 });
  });

  it("treats a budget spent to the cent as exhausted, with nothing overspent", () => {
    const exact = weeklyHeadline({ ...base, remainingMonth: 0, availableThisWeek: 0, dailyRate: 0 });
    expect(exact).toEqual({ kind: "exhausted", overspent: 0, daysLeftInWeek: 3 });
  });

  it("floors a rounding-negative allowance at zero rather than printing it", () => {
    const headline = weeklyHeadline({ ...base, remainingMonth: 0.4, availableThisWeek: -0.01 });
    expect(headline).toMatchObject({ kind: "available", amount: 0 });
  });
});

describe("monthMeter", () => {
  const day = (today: string) => ({ today, daysInMonth: 31 });

  it("reads spending against the calendar", () => {
    const m = monthMeter({ variableBudget: 1500, variableSpentMonth: 700, ...day("2026-08-15") });
    expect(m.spentPct).toBeCloseTo(46.67, 2);
    expect(m.elapsedPct).toBeCloseTo(48.39, 2);
    expect(m.over).toBe(false);
    expect(m.remaining).toBe(800);
    expect(m.overspent).toBe(0);
    expect(m.dayOfMonth).toBe(15);
  });

  it("caps the bar at the budget and reports the overshoot separately", () => {
    const m = monthMeter({ variableBudget: 1500, variableSpentMonth: 1748.16, ...day("2026-08-16") });
    expect(m.spentPct).toBe(100);
    expect(m.over).toBe(true);
    expect(m.overspent).toBe(248.16);
    expect(m.remaining).toBe(0);
  });

  it("spending exactly the budget is not yet over", () => {
    const m = monthMeter({ variableBudget: 1500, variableSpentMonth: 1500, ...day("2026-08-16") });
    expect(m.over).toBe(false);
    expect(m.spentPct).toBe(100);
    expect(m.remaining).toBe(0);
  });

  it("does not divide by a budget of zero", () => {
    expect(monthMeter({ variableBudget: 0, variableSpentMonth: 0, ...day("2026-08-16") })).toMatchObject({
      spentPct: 0,
      over: false,
    });
    expect(monthMeter({ variableBudget: 0, variableSpentMonth: 50, ...day("2026-08-16") })).toMatchObject({
      spentPct: 100,
      over: true,
      overspent: 50,
    });
  });

  it("keeps both percentages inside 0–100 whatever it is handed", () => {
    const m = monthMeter({ variableBudget: Number.NaN, variableSpentMonth: Number.NaN, ...day("2026-08-16") });
    expect(m.spentPct).toBe(0);
    expect(m.elapsedPct).toBeGreaterThan(0);
    const last = monthMeter({ variableBudget: 100, variableSpentMonth: 10, today: "2026-08-31", daysInMonth: 31 });
    expect(last.elapsedPct).toBe(100);
  });
});
