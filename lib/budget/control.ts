// Pure category control, v4: "am I overspending on restaurants?"
//
// A raw percentage lies for the whole first fortnight: 33% on day 10 is fine,
// on day 3 it is not. Every row therefore carries the pace reference (% of
// month elapsed) and — more actionable than either — the end-of-month
// projection at the current run rate. No Prisma — unit-tested in isolation.
//
// FIXED vs DISCRETIONARY. An objective's budget can be part recurring charges
// (`fixedTotal`, from the month's planned items) and part manual assignment.
// Extrapolating a run rate over the fixed part is meaningless — rent does not
// arrive a bit every day, it arrives once and the amount is already known —
// so the projection is `fixedTotal + (discretionary run rate)`. That one
// formula covers all three shapes:
//
//   - fully discretionary (fixedTotal 0) → pure run rate, as before
//   - fully fixed (assigned == fixedTotal) → projection IS the plan
//   - mixed → the plan for what's committed, the pace for what isn't
//
// Consumers that only want the discretionary rows filter on `fixedTotal === 0`
// (the daily dashboard does; rollover funds are excluded upstream either way,
// their polarity being inverted).

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
  /**
   * Σ recurring charges expected this month — the committed slice of
   * `assigned`. 0 for a purely manual objective.
   */
  fixedTotal?: number;
  /** Of `fixedTotal`, how much has already been charged (matched amounts). */
  fixedMatched?: number;
}

export interface ControlRow extends ControlCategoryInput {
  /** Always present on a computed row (0 when the input omitted it). */
  weekConsumed: number;
  fixedTotal: number;
  fixedMatched: number;
  /** consumed / assigned (0 when nothing assigned). */
  percentage: number;
  /** The pace reference: how much of the month has elapsed, same 0–1 scale. */
  monthElapsedPct: number;
  /** fixedTotal + discretionary run rate — where the month is heading. */
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
      const fixedTotal = Math.max(0, c.fixedTotal ?? 0);
      // A charge cannot have been paid beyond what was planned for it, nor
      // beyond what the category has actually consumed.
      const fixedMatched = Math.min(fixedTotal, Math.max(0, c.fixedMatched ?? 0), c.consumed);
      const discretionary = Math.max(0, c.consumed - fixedMatched);
      const projected = round(fixedTotal + (discretionary / elapsed) * daysInMonth);
      const state: ControlState =
        c.consumed > c.assigned ? "EXCEDIDO" : projected > c.assigned ? "RIESGO" : "OK";
      return {
        ...c,
        assigned: round(c.assigned),
        consumed: round(c.consumed),
        weekConsumed: round(c.weekConsumed ?? 0),
        fixedTotal: round(fixedTotal),
        fixedMatched: round(fixedMatched),
        percentage: c.assigned > 0 ? round(c.consumed / c.assigned) : 0,
        monthElapsedPct,
        projectedEndOfMonth: projected,
        projectedDeviation: round(projected - c.assigned),
        state,
      };
    })
    .sort((a, b) => b.projectedDeviation - a.projectedDeviation);
}
