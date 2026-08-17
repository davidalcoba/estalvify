// Pure weekly-available math. The operating window is the WEEK: with ~30
// variable operations a week in the two dominant categories, a monthly target
// gives feedback on the 25th, when nothing can be done about it.
//
// Never divide the month by 4 (months have 4.43 weeks). The daily rate is
// recalculated from what remains, so underspending raises tomorrow's rate by
// itself (no carry-over logic) and a week straddling two months needs no
// special case. ISO weeks, Monday–Sunday.
//
// No Prisma — unit-tested in isolation.

const round = (n: number) => Math.round(n * 100) / 100;

/** ISO day of week for a YYYY-MM-DD date: 1 = Monday … 7 = Sunday. */
export function isoDayOfWeek(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 ? 7 : dow;
}

/** The Monday (YYYY-MM-DD) of the ISO week containing `date`. */
export function isoWeekStart(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const shift = isoDayOfWeek(date) - 1;
  return new Date(Date.UTC(y, m - 1, d - shift)).toISOString().slice(0, 10);
}

/** The Sunday (YYYY-MM-DD) of the ISO week containing `date`. */
export function isoWeekEnd(date: string): string {
  return new Date(Date.parse(isoWeekStart(date)) + 6 * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

export interface WeeklyAvailable {
  /** What remains of the month's variable budget. */
  remainingMonth: number;
  /** remainingMonth spread over the days left of the month (today included). */
  dailyRate: number;
  daysLeftInWeek: number;
  /** THE number: dailyRate × days left of this ISO week (today included). */
  availableThisWeek: number;
}

export function computeWeeklyAvailable(input: {
  variableBudget: number;
  variableSpentMonth: number;
  /** Today's date, YYYY-MM-DD (user timezone). */
  today: string;
  daysInMonth: number;
}): WeeklyAvailable {
  const dayOfMonth = Number(input.today.slice(8, 10));
  const remainingMonth = round(input.variableBudget - input.variableSpentMonth);
  const daysLeftInMonth = Math.max(1, input.daysInMonth - dayOfMonth + 1);
  const dailyRate = round(remainingMonth / daysLeftInMonth);
  const daysLeftInWeek = 8 - isoDayOfWeek(input.today);
  return {
    remainingMonth,
    dailyRate,
    daysLeftInWeek,
    availableThisWeek: round(dailyRate * daysLeftInWeek),
  };
}

/**
 * Which of the two stories the week is telling. The card used to have only
 * one: it printed `availableThisWeek` whatever its sign, so a month already
 * over budget came out as "To spend this week: −15,51 €", explained by
 * "1 day × −15,51 € a day" and "−248,16 € left for the rest of the month". A
 * negative daily rate is not something anyone can act on, and "left" of a
 * negative amount is a contradiction — the arithmetic was right and the
 * sentence was nonsense.
 *
 * The sign is a state, not a value: past the budget there is nothing to spend
 * (0, not a negative allowance) and the number that matters is how far past.
 */
export type WeeklyHeadline =
  | { kind: "available"; amount: number; daysLeftInWeek: number; dailyRate: number }
  /** The month's variable budget is spent. `overspent` is ≥ 0. */
  | { kind: "exhausted"; overspent: number; daysLeftInWeek: number };

export function weeklyHeadline(weekly: WeeklyAvailable): WeeklyHeadline {
  if (!(weekly.remainingMonth > 0)) {
    return {
      kind: "exhausted",
      overspent: round(Math.max(0, -weekly.remainingMonth)),
      daysLeftInWeek: weekly.daysLeftInWeek,
    };
  }
  return {
    kind: "available",
    amount: Math.max(0, weekly.availableThisWeek),
    daysLeftInWeek: weekly.daysLeftInWeek,
    dailyRate: weekly.dailyRate,
  };
}

const clampPct = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0);

export interface MonthMeter {
  /** 0–100 of the month's variable budget already spent. Capped at the budget. */
  spentPct: number;
  /** 0–100 of the month elapsed — the reference that makes spentPct judgeable. */
  elapsedPct: number;
  over: boolean;
  /** How far past the budget, ≥ 0. */
  overspent: number;
  /** What is still spendable, ≥ 0. */
  remaining: number;
  dayOfMonth: number;
}

/**
 * The month behind the week, as two percentages: how much of the budget is
 * gone and how much of the month is. Spending ahead of the calendar is the
 * whole reading, and it is the piece the card had no way to show — six
 * figures and no shape.
 *
 * A budget of 0 is not a division: nothing assigned means any spend is over.
 */
export function monthMeter(input: {
  variableBudget: number;
  variableSpentMonth: number;
  /** Today's date, YYYY-MM-DD (user timezone). */
  today: string;
  daysInMonth: number;
}): MonthMeter {
  const budget = Number.isFinite(input.variableBudget) ? input.variableBudget : 0;
  const spent = Number.isFinite(input.variableSpentMonth) ? input.variableSpentMonth : 0;
  const dayOfMonth = Number(input.today.slice(8, 10));
  const days = input.daysInMonth > 0 ? input.daysInMonth : 1;

  return {
    spentPct: budget > 0 ? clampPct((spent / budget) * 100) : spent > 0 ? 100 : 0,
    elapsedPct: clampPct((dayOfMonth / days) * 100),
    over: spent > budget,
    overspent: round(Math.max(0, spent - budget)),
    remaining: round(Math.max(0, budget - spent)),
    dayOfMonth,
  };
}

export interface VariableTx {
  date: string; // YYYY-MM-DD
  amount: number; // absolute
  categoryId: string | null;
}

export interface WeekOps {
  count: number;
  spent: number;
}

/** Count + total of variable transactions inside the ISO week of `today`. */
export function weekOperations(rows: VariableTx[], today: string): WeekOps {
  const start = isoWeekStart(today);
  const end = new Date(Date.parse(start) + 6 * 86_400_000).toISOString().slice(0, 10);
  let count = 0;
  let spent = 0;
  for (const row of rows) {
    if (row.date < start || row.date > end) continue;
    count += 1;
    spent += row.amount;
  }
  return { count, spent: round(spent) };
}

/**
 * Median operations per COMPLETE week over the trailing `weeks` weeks (the
 * current, incomplete week excluded — comparing a Tuesday against full weeks
 * would always read as an improvement).
 */
export function weeklyOpsMedian(rows: VariableTx[], today: string, weeks = 12): number {
  const currentStart = isoWeekStart(today);
  const counts: number[] = [];
  for (let i = 1; i <= weeks; i++) {
    const start = new Date(Date.parse(currentStart) - i * 7 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const end = new Date(Date.parse(start) + 6 * 86_400_000).toISOString().slice(0, 10);
    counts.push(rows.filter((r) => r.date >= start && r.date <= end).length);
  }
  const sorted = counts.sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export interface WeekCategoryRow {
  categoryId: string | null;
  spent: number;
  count: number;
}

/**
 * Informative composition of the current week's variable spend — no limits, no
 * traffic lights: half the categories are episodic and a weekly budget on them
 * would produce false reds the week shoes get bought.
 */
export function weekComposition(rows: VariableTx[], today: string): WeekCategoryRow[] {
  const start = isoWeekStart(today);
  const end = new Date(Date.parse(start) + 6 * 86_400_000).toISOString().slice(0, 10);
  const byCategory = new Map<string | null, { spent: number; count: number }>();
  for (const row of rows) {
    if (row.date < start || row.date > end) continue;
    const entry = byCategory.get(row.categoryId) ?? { spent: 0, count: 0 };
    entry.spent += row.amount;
    entry.count += 1;
    byCategory.set(row.categoryId, entry);
  }
  return [...byCategory.entries()]
    .map(([categoryId, v]) => ({ categoryId, spent: round(v.spent), count: v.count }))
    .sort((a, b) => b.spent - a.spent);
}
