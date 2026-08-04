// Pure daily cash-flow projection: project each account's balance day by day
// over the next N days from (a) scheduled events — confirmed recurring series
// and dated plan items — and (b) a daily variable-spend rate derived from
// recent history. No Prisma/network — unit-tested in isolation.
//
// This exists because the monthly forecast cannot see a calendar squeeze: rent
// (day 1–6) leaving before salary (day ~28) arrives is invisible at month
// granularity, and that exact gap is what forces reactive transfers and
// credit-card settlements. Days, not months.

import type { Cadence, SeriesOccurrence } from "@/lib/recurring/detect";

const round = (n: number) => Math.round(n * 100) / 100;

// ── Date helpers (UTC, date-only ISO strings) ────────────────────────────

function parts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split("-").map(Number);
  return [y, m, d];
}

function toIso(y: number, m: number, d: number): string {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toISOString().slice(0, 10);
}

/** ISO date `days` after `iso`. */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = parts(iso);
  return toIso(y, m, d + days);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// ── Series scheduling ─────────────────────────────────────────────────────

export type MonthlyAnchor =
  | { type: "DAY"; day: number }
  | { type: "MONTH_END" };

/**
 * Where in the month a monthly series charges. Charges that hug the end of the
 * month (a mortgage on the 31st, 30th, 31st…) anchor to "last day of month" —
 * anchoring those to a fixed day number would drop or double a payment around
 * short months. Everything else anchors to the median day (rent wandering
 * between the 1st and the 6th anchors to its middle).
 */
export function monthlyAnchorFor(history: SeriesOccurrence[]): MonthlyAnchor {
  const fromEnd: number[] = [];
  const days: number[] = [];
  for (const occ of history) {
    const [y, m, d] = parts(occ.date);
    fromEnd.push(daysInMonth(y, m) - d);
    days.push(d);
  }
  const median = (v: number[]) => {
    const s = [...v].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
  };
  if (fromEnd.length > 0 && median(fromEnd) <= 2) return { type: "MONTH_END" };
  return { type: "DAY", day: Math.max(1, Math.round(median(days))) };
}

export interface SeriesScheduleInput {
  cadence: Cadence;
  /** Chronological occurrences; drives the monthly anchor. */
  history: SeriesOccurrence[];
  /** Next expected charge (YYYY-MM-DD) from detection. */
  nextExpected: string;
}

/**
 * Projected charge dates for a series inside (from, to], both ISO dates.
 * Monthly series repeat on their anchor (median day, or month-end for charges
 * that hug it); other cadences step from `nextExpected`. An overdue
 * `nextExpected` (missed charge) is clamped forward: the projection assumes it
 * will still land, tomorrow at the earliest — dropping it would hide exactly
 * the charge most likely to hurt.
 */
export function scheduleSeries(
  input: SeriesScheduleInput,
  from: string,
  to: string
): string[] {
  const dates: string[] = [];
  const push = (iso: string) => {
    if (iso > from && iso <= to) dates.push(iso);
  };

  if (input.cadence === "MONTHLY") {
    const anchor = monthlyAnchorFor(input.history);
    // Walk month by month from the expected month to the horizon's month.
    let [y, m] = parts(input.nextExpected);
    const [toY, toM] = parts(to);
    while (y < toY || (y === toY && m <= toM)) {
      const day =
        anchor.type === "MONTH_END"
          ? daysInMonth(y, m)
          : Math.min(anchor.day, daysInMonth(y, m));
      const occurrence = toIso(y, m, day);
      // A charge whose scheduled day already passed is still owed — assume it
      // lands tomorrow rather than silently vanishing from the projection.
      push(occurrence <= from ? addDays(from, 1) : occurrence);
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
    return dedupeSorted(dates);
  }

  const stepDays = input.cadence === "WEEKLY" ? 7 : null;
  let current = input.nextExpected;
  if (current <= from) {
    // Overdue: assume it lands tomorrow, then resume the normal rhythm.
    push(addDays(from, 1));
    current = stepFrom(current, input.cadence);
    while (current <= from) current = stepFrom(current, input.cadence);
  }
  let guard = 0;
  while (current <= to && guard < 400) {
    push(current);
    current = stepDays ? addDays(current, stepDays) : stepFrom(current, input.cadence);
    guard += 1;
  }
  return dedupeSorted(dates);
}

function stepFrom(iso: string, cadence: Cadence): string {
  const [y, m, d] = parts(iso);
  switch (cadence) {
    case "WEEKLY":
      return toIso(y, m, d + 7);
    case "MONTHLY":
      return toIso(y, m + 1, d);
    case "QUARTERLY":
      return toIso(y, m + 3, d);
    case "YEARLY":
      return toIso(y + 1, m, d);
  }
}

function dedupeSorted(dates: string[]): string[] {
  return [...new Set(dates)].sort();
}

// ── Daily projection ──────────────────────────────────────────────────────

export interface ScheduledEvent {
  label: string;
  direction: "DEBIT" | "CREDIT";
  amount: number; // absolute
  date: string; // YYYY-MM-DD
}

export interface AccountProjectionInput {
  accountId: string;
  accountName: string;
  startingBalance: number;
  /** Average variable (non-recurring) daily spend, applied every day. */
  dailyVariableSpend: number;
  events: ScheduledEvent[];
}

export interface DailyPoint {
  date: string; // YYYY-MM-DD
  balance: number;
}

export interface AccountProjection {
  accountId: string;
  accountName: string;
  startingBalance: number;
  points: DailyPoint[];
  /** Lowest projected balance and the day it happens. */
  minBalance: number;
  minDate: string;
}

/** Project one account's balance for each of the `horizonDays` days after `today`. */
export function projectAccountDaily(
  account: AccountProjectionInput,
  today: string,
  horizonDays: number
): AccountProjection {
  const byDate = new Map<string, number>();
  for (const event of account.events) {
    const signed = event.direction === "CREDIT" ? event.amount : -event.amount;
    byDate.set(event.date, (byDate.get(event.date) ?? 0) + signed);
  }

  let balance = account.startingBalance;
  let minBalance = balance;
  let minDate = today;
  const points: DailyPoint[] = [];
  for (let i = 1; i <= horizonDays; i++) {
    const date = addDays(today, i);
    balance = balance - account.dailyVariableSpend + (byDate.get(date) ?? 0);
    balance = round(balance);
    points.push({ date, balance });
    if (balance < minBalance) {
      minBalance = balance;
      minDate = date;
    }
  }

  return {
    accountId: account.accountId,
    accountName: account.accountName,
    startingBalance: account.startingBalance,
    points,
    minBalance,
    minDate,
  };
}

/** Element-wise sum of per-account projections (all share the same dates). */
export function consolidateDaily(projections: AccountProjection[]): DailyPoint[] {
  if (projections.length === 0) return [];
  return projections[0].points.map((point, i) => ({
    date: point.date,
    balance: round(
      projections.reduce((sum, p) => sum + (p.points[i]?.balance ?? 0), 0)
    ),
  }));
}

export interface CashflowBreach {
  date: string;
  balance: number;
  daysAway: number;
}

/** First projected day below `threshold`, or null if it never dips. */
export function firstBreach(
  points: DailyPoint[],
  threshold: number
): CashflowBreach | null {
  for (let i = 0; i < points.length; i++) {
    if (points[i].balance < threshold) {
      return { date: points[i].date, balance: points[i].balance, daysAway: i + 1 };
    }
  }
  return null;
}

/**
 * Average daily variable spend from a recent window: total DEBIT spend minus
 * what belongs to scheduled series (those are projected on their own dates —
 * counting them here would double them). `windowDays` must cover the rows.
 */
export function dailyVariableSpend(
  totalDebit: number,
  recurringDebit: number,
  windowDays: number
): number {
  if (windowDays <= 0) return 0;
  const variable = Math.max(0, totalDebit - recurringDebit);
  return round(variable / windowDays);
}
