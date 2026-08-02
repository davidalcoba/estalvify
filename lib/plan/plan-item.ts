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
 * Signed amount a plan item contributes to a specific calendar month's net
 * (income positive, expense negative). Periodic items contribute their monthly
 * equivalent every month; a ONE_OFF contributes its full amount only in the month
 * of its `onDate`. Used to build the Forecast's per-month net.
 */
export function plannedForMonth(item: PlanItemInput, year: number, month: number): number {
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
 * category). This is each category's planned limit; ONE_OFF items are excluded
 * because a one-off is not a recurring monthly cap.
 */
export function plannedMonthlyByCategory(items: PlanItemInput[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const item of items) {
    if (item.direction !== "DEBIT" || item.cadence === "ONE_OFF" || !item.categoryId) continue;
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
 * Steady monthly income / expenses / net over periodic items (the "am I planning
 * to save?" figure). ONE_OFF items are excluded from the steady monthly view.
 */
export function planTotals(items: PlanItemInput[]): PlanTotals {
  let monthlyIncome = 0;
  let monthlyExpenses = 0;
  for (const item of items) {
    if (item.cadence === "ONE_OFF") continue;
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
