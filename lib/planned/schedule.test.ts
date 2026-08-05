import { describe, it, expect } from "vitest";
import {
  isDueInMonth,
  resolveWindow,
  isoDate,
  addMonths,
  daysInMonth,
} from "./schedule";

describe("isDueInMonth", () => {
  it("monthly is always due", () => {
    expect(
      isDueInMonth(
        { cadence: "MONTHLY", anchorDate: null, windowFromDay: 1, windowToDay: 6, anchorMonthEnd: false },
        { year: 2026, month: 9 }
      )
    ).toBe(true);
  });

  it("bimonthly steps from its anchor month (Aigües: due every other month)", () => {
    const shape = {
      cadence: "BIMONTHLY" as const,
      anchorDate: "2026-07-23",
      windowFromDay: 22,
      windowToDay: 24,
      anchorMonthEnd: false,
    };
    expect(isDueInMonth(shape, { year: 2026, month: 9 })).toBe(true);
    expect(isDueInMonth(shape, { year: 2026, month: 8 })).toBe(false);
    expect(isDueInMonth(shape, { year: 2027, month: 1 })).toBe(true);
  });

  it("yearly lands on the anniversary month", () => {
    const shape = {
      cadence: "YEARLY" as const,
      anchorDate: "2026-06-15",
      windowFromDay: null,
      windowToDay: null,
      anchorMonthEnd: false,
    };
    expect(isDueInMonth(shape, { year: 2027, month: 6 })).toBe(true);
    expect(isDueInMonth(shape, { year: 2027, month: 5 })).toBe(false);
  });

  it("skipMonths vetoes a month regardless of cadence (school skips August)", () => {
    const escola = {
      cadence: "MONTHLY" as const,
      anchorDate: null,
      skipMonths: [8],
      windowFromDay: 2,
      windowToDay: 5,
      anchorMonthEnd: false,
    };
    expect(isDueInMonth(escola, { year: 2026, month: 8 })).toBe(false);
    expect(isDueInMonth(escola, { year: 2026, month: 7 })).toBe(true);
    expect(isDueInMonth(escola, { year: 2026, month: 9 })).toBe(true);
    // Empty list = no skips.
    expect(isDueInMonth({ ...escola, skipMonths: [] }, { year: 2026, month: 8 })).toBe(true);
  });

  it("weekly and irregular never generate instances", () => {
    expect(
      isDueInMonth(
        { cadence: "WEEKLY", anchorDate: "2026-08-01", windowFromDay: null, windowToDay: null, anchorMonthEnd: false },
        { year: 2026, month: 8 }
      )
    ).toBe(false);
  });
});

describe("resolveWindow", () => {
  it("month-end anchoring follows the month's length (the mortgage)", () => {
    const shape = { windowFromDay: null, windowToDay: null, anchorMonthEnd: true };
    expect(resolveWindow(shape, { year: 2026, month: 9 })).toEqual({ fromDay: 30, toDay: 30 });
    expect(resolveWindow(shape, { year: 2026, month: 10 })).toEqual({ fromDay: 31, toDay: 31 });
    expect(resolveWindow(shape, { year: 2028, month: 2 })).toEqual({ fromDay: 29, toDay: 29 });
  });

  it("a rent-style window passes through (1–6)", () => {
    expect(
      resolveWindow({ windowFromDay: 1, windowToDay: 6, anchorMonthEnd: false }, { year: 2026, month: 9 })
    ).toEqual({ fromDay: 1, toDay: 6 });
  });

  it("clamps a day-31 window in a 30-day month", () => {
    expect(
      resolveWindow({ windowFromDay: 30, windowToDay: 31, anchorMonthEnd: false }, { year: 2026, month: 9 })
    ).toEqual({ fromDay: 30, toDay: 30 });
  });

  it("nothing configured means the whole month", () => {
    expect(
      resolveWindow({ windowFromDay: null, windowToDay: null, anchorMonthEnd: false }, { year: 2026, month: 9 })
    ).toEqual({ fromDay: 1, toDay: 30 });
  });
});

describe("helpers", () => {
  it("isoDate clamps to the month", () => {
    expect(isoDate({ year: 2026, month: 2 }, 31)).toBe("2026-02-28");
  });
  it("addMonths crosses years", () => {
    expect(addMonths({ year: 2026, month: 11 }, 3)).toEqual({ year: 2027, month: 2 });
  });
  it("daysInMonth", () => {
    expect(daysInMonth(2026, 2)).toBe(28);
  });
});
