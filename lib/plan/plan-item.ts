// Pure planning logic: turns the user's standing PlanItems (expected income and
// expenses with a cadence) into monthly equivalents, per-category limits and the
// month-by-month figures the Forecast projects from. No React/Prisma — reuses
// `monthlyEquivalent` (recurring) and `budget-progress`, and is unit-tested in
// isolation. The DB read + Decimal→number conversion happens in the page/actions.

import { monthlyEquivalent } from "@/lib/recurring/recurring-dto";
import type { Cadence } from "@/lib/recurring/detect";

export type PlanCadence = Cadence | "ONE_OFF";
export type PlanDirection = "DEBIT" | "CREDIT";

/** Serializable plan item as it crosses to pure logic / the client. */
export interface PlanItemInput {
  direction: PlanDirection;
  categoryId: string | null;
  amount: number;
  cadence: PlanCadence;
  /** ISO date "YYYY-MM-DD" for ONE_OFF items; null otherwise. */
  onDate?: string | null;
  /**
   * ISO date "YYYY-MM-DD" the item stops applying (a loan's last payment, a
   * contract that expires), or null/absent for open-ended. Inclusive of its own
   * month — the item counts in the month the date falls in, and nothing after.
   */
  endDate?: string | null;
}

/** A calendar month, used as the reference point for "is this still current?". */
export interface YearMonth {
  year: number;
  month: number;
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Per-month figure for a plan item's amount. Periodic cadences use
 * `monthlyEquivalent`; ONE_OFF returns 0 (a one-off is not a steady monthly cost —
 * it is counted in its own month by `plannedForMonth`).
 */
export function planMonthlyEquivalent(amount: number, cadence: PlanCadence): number {
  if (cadence === "ONE_OFF") return 0;
  return monthlyEquivalent(amount, cadence);
}

/** The (year, month) an ISO "YYYY-MM-DD" date falls in, or null if unparseable. */
function isoYearMonth(iso: string | null | undefined): { year: number; month: number } | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]) };
}

/**
 * Whether the item still applies in a given month: true when it is open-ended,
 * or its `endDate` falls in that month or later. An item that ended in the past
 * stays in the Plan as a record but stops counting anywhere.
 */
export function isActiveInMonth(item: PlanItemInput, year: number, month: number): boolean {
  const end = isoYearMonth(item.endDate);
  if (!end) return true;
  return end.year > year || (end.year === year && end.month >= month);
}

/**
 * Signed amount a plan item contributes to a specific calendar month's net
 * (income positive, expense negative). Periodic items contribute their monthly
 * equivalent every month up to their `endDate`; a ONE_OFF contributes its full
 * amount only in the month of its `onDate`. Used to build the Forecast's
 * per-month net.
 */
export function plannedForMonth(item: PlanItemInput, year: number, month: number): number {
  if (!isActiveInMonth(item, year, month)) return 0;

  let amount: number;
  if (item.cadence === "ONE_OFF") {
    const ym = isoYearMonth(item.onDate);
    amount = ym && ym.year === year && ym.month === month ? item.amount : 0;
  } else {
    amount = planMonthlyEquivalent(item.amount, item.cadence);
  }
  if (amount === 0) return 0;
  return round(item.direction === "CREDIT" ? amount : -amount);
}

/**
 * Steady monthly expense total per category (DEBIT, periodic items with a
 * category) as of the reference month `ref`. This is each category's planned
 * limit; ONE_OFF items are excluded because a one-off is not a recurring monthly
 * cap, and so are items that ended before `ref`.
 */
export function plannedMonthlyByCategory(
  items: PlanItemInput[],
  ref: YearMonth
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const item of items) {
    if (item.direction !== "DEBIT" || item.cadence === "ONE_OFF" || !item.categoryId) continue;
    if (!isActiveInMonth(item, ref.year, ref.month)) continue;
    const monthly = planMonthlyEquivalent(item.amount, item.cadence);
    totals[item.categoryId] = round((totals[item.categoryId] ?? 0) + monthly);
  }
  return totals;
}

export interface PlanTotals {
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlyNet: number;
}

/**
 * Steady monthly income / expenses / net over the periodic items in force in the
 * reference month `ref` (the "am I planning to save?" figure). ONE_OFF items are
 * excluded from the steady monthly view, as are items that already ended.
 */
export function planTotals(items: PlanItemInput[], ref: YearMonth): PlanTotals {
  let monthlyIncome = 0;
  let monthlyExpenses = 0;
  for (const item of items) {
    if (item.cadence === "ONE_OFF") continue;
    if (!isActiveInMonth(item, ref.year, ref.month)) continue;
    const monthly = planMonthlyEquivalent(item.amount, item.cadence);
    if (item.direction === "CREDIT") monthlyIncome += monthly;
    else monthlyExpenses += monthly;
  }
  return {
    monthlyIncome: round(monthlyIncome),
    monthlyExpenses: round(monthlyExpenses),
    monthlyNet: round(monthlyIncome - monthlyExpenses),
  };
}
