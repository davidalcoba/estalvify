// Pure recurring-series alert logic: spot a charge that deviates from its
// series' usual amount, and a series whose expected charge never arrived.
// No Prisma/network — unit-tested in isolation; the notification generator
// feeds it live detection candidates.

import { median, daysBetween, type SeriesOccurrence } from "./detect";

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Fraction the latest charge may deviate from the series baseline before it is
 * worth an alert. 15% catches the real cases this was designed on (a home
 * insurance quietly up 9% stays quiet; a fibre bill jumping 58 → 88 € does not…
 * the 9% case is exactly why the threshold is configurable per call).
 */
export const AMOUNT_DEVIATION_THRESHOLD = 0.15;

/** Days past `nextExpected` before a series counts as missed. Covers weekends,
 * bank holidays shifting a direct debit, and the sync's own daily lag. */
export const MISSED_GRACE_DAYS = 4;

export interface AmountDeviation {
  /** The charge that deviated. */
  latestAmount: number;
  latestDate: string; // YYYY-MM-DD
  /** Median of the charges before the latest one. */
  baselineAmount: number;
  /** Signed relative change, e.g. +0.52 for a 52% increase. */
  relativeChange: number;
}

/**
 * Whether the latest charge of a series deviates from the baseline (median of
 * all previous charges — the median shrugs off one earlier outlier) by more
 * than `threshold`. Needs at least 3 occurrences so the baseline is not a
 * single charge. Returns null when the series is within its normal range.
 */
export function detectAmountDeviation(
  history: SeriesOccurrence[],
  threshold: number = AMOUNT_DEVIATION_THRESHOLD
): AmountDeviation | null {
  if (history.length < 3) return null;
  const latest = history[history.length - 1];
  const baseline = median(history.slice(0, -1).map((o) => o.amount));
  if (baseline <= 0) return null;

  const relativeChange = (latest.amount - baseline) / baseline;
  if (Math.abs(relativeChange) < threshold) return null;

  return {
    latestAmount: latest.amount,
    latestDate: latest.date,
    baselineAmount: round(baseline),
    relativeChange: Math.round(relativeChange * 1000) / 1000,
  };
}

export interface MissedSeries {
  expectedDate: string; // YYYY-MM-DD
  daysOverdue: number;
}

/**
 * Whether a series' expected charge is overdue: `nextExpected` passed more than
 * `graceDays` ago and nothing newer was seen. Detection recomputes
 * `nextExpected` from the latest occurrence, so a charge that did arrive moves
 * the date forward and this stays null.
 */
export function detectMissedSeries(
  nextExpected: string,
  today: string,
  graceDays: number = MISSED_GRACE_DAYS
): MissedSeries | null {
  const overdue = daysBetween(nextExpected, today);
  if (overdue <= graceDays) return null;
  return { expectedDate: nextExpected, daysOverdue: overdue };
}
