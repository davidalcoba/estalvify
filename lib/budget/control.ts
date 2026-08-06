// Pure category control, v4: "am I overspending on restaurants?"
//
// Only categories with a MANUAL objective belong here (non-rollover budget
// lines whose objective carries no recurring base). Planned/recurring-fed
// categories are noise — nothing can be decided about them mid-month — and
// rollover funds have inverted polarity (accumulation, more is better), so
// both are excluded and funds render in their own section.
//
// A raw percentage lies for the whole first fortnight: 33% on day 10 is fine,
// on day 3 it is not. Every row therefore carries the pace reference (% of
// month elapsed) and — more actionable than either — the end-of-month
// projection at the current run rate. No Prisma — unit-tested in isolation.

const round = (n: number) => Math.round(n * 100) / 100;

export type ControlState = "OK" | "RIESGO" | "EXCEDIDO";

export interface ControlCategoryInput {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  assigned: number;
  consumed: number;
  /** Spent inside the current ISO week (same subtree rollup as consumed). */
  weekConsumed?: number;
}

export interface ControlRow extends ControlCategoryInput {
  /** Always present on a computed row (0 when the input omitted it). */
  weekConsumed: number;
  /** consumed / assigned (0 when nothing assigned). */
  percentage: number;
  /** The pace reference: how much of the month has elapsed, same 0–1 scale. */
  monthElapsedPct: number;
  /** consumed / daysElapsed × daysInMonth — where the month is heading. */
  projectedEndOfMonth: number;
  /** projectedEndOfMonth − assigned: the number the list is sorted by. */
  projectedDeviation: number;
  state: ControlState;
}

/**
 * Build the control rows. `daysElapsed` counts today as elapsed (day 12 →
 * 12); a closed month passes daysElapsed = daysInMonth, which makes the
 * projection equal the consumed amount — reality, no extrapolation.
 */
export function computeControl(
  categories: ControlCategoryInput[],
  daysElapsed: number,
  daysInMonth: number
): ControlRow[] {
  const elapsed = Math.min(Math.max(1, daysElapsed), daysInMonth);
  const monthElapsedPct = round((elapsed / daysInMonth) * 100) / 100;
  return categories
    .map((c) => {
      const projected = round((c.consumed / elapsed) * daysInMonth);
      const state: ControlState =
        c.consumed > c.assigned ? "EXCEDIDO" : projected > c.assigned ? "RIESGO" : "OK";
      return {
        ...c,
        assigned: round(c.assigned),
        consumed: round(c.consumed),
        weekConsumed: round(c.weekConsumed ?? 0),
        percentage: c.assigned > 0 ? round(c.consumed / c.assigned) : 0,
        monthElapsedPct,
        projectedEndOfMonth: projected,
        projectedDeviation: round(projected - c.assigned),
        state,
      };
    })
    .sort((a, b) => b.projectedDeviation - a.projectedDeviation);
}
