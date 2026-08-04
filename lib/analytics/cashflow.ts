// Pure daily cash-flow projection: project each account's balance day by day
// over the next N days from (a) scheduled events (the month's planned items) — and (b) a daily variable-spend rate derived from
// recent history. No Prisma/network — unit-tested in isolation.
//
// This exists because the monthly forecast cannot see a calendar squeeze: rent
// (day 1–6) leaving before salary (day ~28) arrives is invisible at month
// granularity, and that exact gap is what forces reactive transfers and
// credit-card settlements. Days, not months.


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
