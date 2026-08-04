// Pure monthly cascade — the calculation that makes the available number TRUE:
//
//   base income (config, never inferred)
//   − planned items due this month (actual amount once matched)
//   − rollover-fund quotas (budget_items with rollover: the IBI accumulating)
//   − savings goal (a commitment next to the rent, never a residue)
//   ─────────────────────────────────────────────
//   = the month's variable budget
//
// Income above the base is extraordinary BY DIFFERENCE — no detection.
// No Prisma — unit-tested in isolation.

const round = (n: number) => Math.round(n * 100) / 100;

export interface PlannedForCascade {
  direction: "DEBIT" | "CREDIT";
  amount: number;
  matchedAmount: number | null;
  status: "PENDING" | "MATCHED" | "MISSED";
}

export interface MonthCascade {
  baseIncome: number;
  plannedCharges: number;
  rolloverQuotas: number;
  savingsGoal: number;
  variableBudget: number;
}

/**
 * The month's cascade. Planned DEBIT items count at their matched amount once
 * one arrived (truth beats estimate) and at the expected amount otherwise —
 * including MISSED: a bill whose window closed unpaid is still owed, and
 * dropping it would inflate the available exactly when things go wrong.
 * Planned CREDIT items never enter — income is the configured base, and
 * counting salary series here would double it.
 */
export function computeCascade(input: {
  baseIncome: number;
  plannedItems: PlannedForCascade[];
  rolloverQuotas: number;
  savingsGoal: number;
}): MonthCascade {
  let plannedCharges = 0;
  for (const item of input.plannedItems) {
    if (item.direction !== "DEBIT") continue;
    plannedCharges += item.status === "MATCHED" && item.matchedAmount != null
      ? item.matchedAmount
      : item.amount;
  }
  const rolloverQuotas = round(Math.max(0, input.rolloverQuotas));
  const savingsGoal = round(Math.max(0, input.savingsGoal));
  const baseIncome = round(Math.max(0, input.baseIncome));
  plannedCharges = round(plannedCharges);
  return {
    baseIncome,
    plannedCharges,
    rolloverQuotas,
    savingsGoal,
    variableBudget: round(baseIncome - plannedCharges - rolloverQuotas - savingsGoal),
  };
}

/** Extraordinary income by difference: what arrived above the configured base. */
export function extraordinaryIncome(actualIncome: number, baseIncome: number): number {
  return round(Math.max(0, actualIncome - baseIncome));
}

export interface RolloverMonthRow {
  assigned: number;
  spent: number;
}

/**
 * A rollover fund's balance: every month's assignment minus what its category
 * actually spent, summed since the fund began. Derived, never stored — it can
 * always be recomputed and cannot drift.
 */
export function rolloverBalance(rows: RolloverMonthRow[]): number {
  return round(rows.reduce((sum, r) => sum + r.assigned - r.spent, 0));
}
