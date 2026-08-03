// Parsing and validation for the Reports page filters. Pure — no Prisma or
// network imports — so the URL contract can be unit-tested on its own, the same
// way `spending.ts` and `trends.ts` are.

import type { MonthBucket } from "./trends";
import { lastNMonths } from "./trends";

/** Trend windows offered by the filter bar, in months. */
export const TREND_WINDOWS = [6, 12, 24] as const;
export type TrendWindow = (typeof TREND_WINDOWS)[number];

export const DEFAULT_TREND_WINDOW: TrendWindow = 12;

/** How far back the month picker goes, counting the current month. */
export const MONTH_OPTIONS = 24;

/** Radix forbids an empty option value, so "All accounts" travels as a sentinel. */
export const ALL_ACCOUNTS = "__all__";

export interface ReportFilters {
  /** Reference month for the breakdown cards, and the last bucket of the trend. */
  month: MonthBucket;
  /** Number of months the income-vs-expenses chart covers, ending at `month`. */
  trendMonths: TrendWindow;
  /** Bank account to restrict every report to, or "" for all accounts. */
  accountId: string;
}

/** `YYYY-MM` — the wire format of the `month` search param. */
export function formatYearMonth({ year, month }: MonthBucket): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Parses `YYYY-MM`, returning null for anything malformed or out of range. */
export function parseYearMonth(value: string | undefined): MonthBucket | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

/** True when `a` is the same calendar month as `b`. */
export function isSameMonth(a: MonthBucket, b: MonthBucket): boolean {
  return a.year === b.year && a.month === b.month;
}

/**
 * The months offered by the picker: the trailing `MONTH_OPTIONS` months ending
 * at `current`, newest first (the newest is what a user reaches for most).
 */
export function selectableMonths(current: MonthBucket): MonthBucket[] {
  return lastNMonths(current.year, current.month, MONTH_OPTIONS).reverse();
}

/**
 * Resolves the URL's search params into filters, falling back to the defaults
 * for anything missing or out of range. A month outside the picker's window is
 * rejected rather than clamped: a stale or hand-edited URL should land on the
 * current month, not on a silently different one.
 */
export function parseReportFilters(
  params: { month?: string; trend?: string; accountId?: string },
  current: MonthBucket,
): ReportFilters {
  const requested = parseYearMonth(params.month);
  const allowed = selectableMonths(current);
  const month =
    requested && allowed.some((m) => isSameMonth(m, requested))
      ? requested
      : current;

  const trend = Number(params.trend);
  const trendMonths = (TREND_WINDOWS as readonly number[]).includes(trend)
    ? (trend as TrendWindow)
    : DEFAULT_TREND_WINDOW;

  const accountId =
    params.accountId && params.accountId !== ALL_ACCOUNTS ? params.accountId : "";

  return { month, trendMonths, accountId };
}
