// Pure scheduling for planned items: when is a recurring series due in a given
// calendar month, and which day window does the charge land in. No Prisma —
// unit-tested in isolation.
//
// Two realities drive the shapes here: the mortgage charges on the LAST day of
// the month (31 Mar, 30 Apr, 31 May…), so a fixed day number would drop or
// double a payment around short months; and rent wanders inside a window
// (2 Apr, 6 May, 1 Jun…), so a single date would be a lie. Windows of days,
// never closed months.

export type Cadence =
  | "WEEKLY"
  | "MONTHLY"
  | "BIMONTHLY"
  | "QUARTERLY"
  | "YEARLY"
  | "IRREGULAR";

export interface YearMonth {
  year: number;
  month: number; // 1–12
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function monthsBetween(a: YearMonth, b: YearMonth): number {
  return (b.year - a.year) * 12 + (b.month - a.month);
}

export function addMonths(ym: YearMonth, n: number): YearMonth {
  const zero = ym.year * 12 + (ym.month - 1) + n;
  return { year: Math.floor(zero / 12), month: (zero % 12 + 12) % 12 + 1 };
}

const CADENCE_STEP: Partial<Record<Cadence, number>> = {
  MONTHLY: 1,
  BIMONTHLY: 2,
  QUARTERLY: 3,
  YEARLY: 12,
};

export interface SeriesScheduleShape {
  cadence: Cadence;
  /** Anchor for non-monthly cadences: any date (ISO) in a month the series IS due. */
  anchorDate: string | null;
  windowFromDay: number | null;
  windowToDay: number | null;
  anchorMonthEnd: boolean;
}

/**
 * Whether a series is due in `target`. Monthly is always due; bimonthly /
 * quarterly / yearly step from the anchor month. WEEKLY and IRREGULAR never
 * generate planned instances (nothing in the seed needs them; a weekly charge
 * would need per-week instances, which the weekly available view absorbs as
 * variable anyway).
 */
export function isDueInMonth(shape: SeriesScheduleShape, target: YearMonth): boolean {
  const step = CADENCE_STEP[shape.cadence];
  if (!step) return false;
  if (step === 1) return true;
  if (!shape.anchorDate) return false;
  const m = /^(\d{4})-(\d{2})/.exec(shape.anchorDate);
  if (!m) return false;
  const anchor = { year: Number(m[1]), month: Number(m[2]) };
  const distance = monthsBetween(anchor, target);
  return ((distance % step) + step) % step === 0;
}

export interface DayWindow {
  fromDay: number;
  toDay: number;
}

/**
 * The day window a charge lands in for a given month. Month-end anchoring wins;
 * a partial window fills from its other edge; nothing configured means "any
 * day of the month" (honest, if unhelpful — the matcher still works).
 */
export function resolveWindow(
  shape: Pick<SeriesScheduleShape, "windowFromDay" | "windowToDay" | "anchorMonthEnd">,
  target: YearMonth
): DayWindow {
  const last = daysInMonth(target.year, target.month);
  if (shape.anchorMonthEnd) return { fromDay: last, toDay: last };
  const from = shape.windowFromDay ?? shape.windowToDay ?? 1;
  const to = shape.windowToDay ?? shape.windowFromDay ?? last;
  return {
    fromDay: Math.min(Math.max(1, from), last),
    toDay: Math.min(Math.max(1, Math.max(from, to)), last),
  };
}

/** ISO date for a day of a month, clamped to the month's length. */
export function isoDate(target: YearMonth, day: number): string {
  const clamped = Math.min(Math.max(1, day), daysInMonth(target.year, target.month));
  return `${target.year}-${String(target.month).padStart(2, "0")}-${String(clamped).padStart(2, "0")}`;
}

/** The months from `start` (inclusive) covering `count` months forward. */
export function monthsForward(start: YearMonth, count: number): YearMonth[] {
  return Array.from({ length: count }, (_, i) => addMonths(start, i));
}
