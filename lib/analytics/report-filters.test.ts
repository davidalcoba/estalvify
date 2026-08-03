import { describe, it, expect } from "vitest";
import {
  ALL_ACCOUNTS,
  DEFAULT_TREND_WINDOW,
  MONTH_OPTIONS,
  formatYearMonth,
  parseReportFilters,
  parseYearMonth,
  selectableMonths,
} from "./report-filters";

const current = { year: 2026, month: 8 };

describe("formatYearMonth / parseYearMonth", () => {
  it("round-trips a month", () => {
    expect(formatYearMonth({ year: 2026, month: 3 })).toBe("2026-03");
    expect(parseYearMonth("2026-03")).toEqual({ year: 2026, month: 3 });
  });

  it("rejects malformed or out-of-range values", () => {
    expect(parseYearMonth(undefined)).toBeNull();
    expect(parseYearMonth("")).toBeNull();
    expect(parseYearMonth("2026-13")).toBeNull();
    expect(parseYearMonth("2026-00")).toBeNull();
    expect(parseYearMonth("26-3")).toBeNull();
    expect(parseYearMonth("2026-03-01")).toBeNull();
  });
});

describe("selectableMonths", () => {
  it("lists the trailing window newest first, ending at the current month", () => {
    const months = selectableMonths(current);
    expect(months).toHaveLength(MONTH_OPTIONS);
    expect(months[0]).toEqual(current);
    expect(months[MONTH_OPTIONS - 1]).toEqual({ year: 2024, month: 9 });
  });
});

describe("parseReportFilters", () => {
  it("falls back to the current month and the default window", () => {
    expect(parseReportFilters({}, current)).toEqual({
      month: current,
      trendMonths: DEFAULT_TREND_WINDOW,
      accountId: "",
    });
  });

  it("accepts a month inside the picker window", () => {
    expect(parseReportFilters({ month: "2026-02" }, current).month).toEqual({
      year: 2026,
      month: 2,
    });
  });

  it("ignores a month outside the window instead of clamping it", () => {
    expect(parseReportFilters({ month: "2020-01" }, current).month).toEqual(current);
    expect(parseReportFilters({ month: "2027-01" }, current).month).toEqual(current);
  });

  it("accepts only the offered trend windows", () => {
    expect(parseReportFilters({ trend: "6" }, current).trendMonths).toBe(6);
    expect(parseReportFilters({ trend: "24" }, current).trendMonths).toBe(24);
    expect(parseReportFilters({ trend: "7" }, current).trendMonths).toBe(
      DEFAULT_TREND_WINDOW,
    );
    expect(parseReportFilters({ trend: "abc" }, current).trendMonths).toBe(
      DEFAULT_TREND_WINDOW,
    );
  });

  it("maps the all-accounts sentinel to no account filter", () => {
    expect(parseReportFilters({ accountId: ALL_ACCOUNTS }, current).accountId).toBe("");
    expect(parseReportFilters({ accountId: "acc-1" }, current).accountId).toBe("acc-1");
  });
});
