// Pure monthly cascade, v4: the savings TARGET is the input and the variable
// budget is the RESIDUE.
//
//   expected income   (CREDIT planned items of the budget month)
//   − expected charges (DEBIT planned items of the budget month)
//   − rollover-fund quotas (budget_items with rollover)
//   − SAVINGS TARGET   ← the input, stored per month
//   ─────────────────────────────────────────────
//   = variable budget  (what the month may spend)
//
// The app answers ONE question: "if I want to save X, how much can I spend?"
// There is deliberately no inverse mode (fix the spend, read the savings) —
// same equation, one more decision per screen. Move the target, watch the
// variable move.
//
// The per-category assignments (Σ non-rollover budget lines) are compared
// against the residue: a mismatch is SHOWN as assignmentGap, never squared
// automatically. The cascade always uses EXPECTED amounts (the plan); reality
// lands in `performance`. No Prisma — unit-tested in isolation.

const round = (n: number) => Math.round(n * 100) / 100;

export interface PlannedForCascade {
  direction: "DEBIT" | "CREDIT";
  amount: number; // expected
}

export interface MonthCascade {
  expectedIncome: number;
  expectedCharges: number;
  rolloverQuotas: number;
  /** The monthly savings goal — an INPUT, stored per month. */
  savingsTarget: number;
  /** The residue: income − charges − quotas − savingsTarget, floored at 0. */
  variableBudget: number;
  /** Σ non-rollover budget lines — the per-category split of the residue. */
  assignedVariable: number;
  /** assignedVariable − variableBudget. Shown, never auto-squared. */
  assignmentGap: number;
  /**
   * income − charges − quotas − variableBudget. Equals savingsTarget while the
   * residue is positive; smaller when the target exceeds what the month has.
   */
  expectedResult: number;
}

export function computeCascade(input: {
  plannedItems: PlannedForCascade[];
  rolloverQuotas: number;
  savingsTarget: number;
  /** Σ non-rollover budget line assignments (the categories' split). */
  assignedVariable: number;
}): MonthCascade {
  let expectedIncome = 0;
  let expectedCharges = 0;
  for (const item of input.plannedItems) {
    if (item.direction === "CREDIT") expectedIncome += item.amount;
    else expectedCharges += item.amount;
  }
  expectedIncome = round(expectedIncome);
  expectedCharges = round(expectedCharges);
  const rolloverQuotas = round(Math.max(0, input.rolloverQuotas));
  const savingsTarget = round(Math.max(0, input.savingsTarget));
  const assignedVariable = round(Math.max(0, input.assignedVariable));
  const variableBudget = round(
    Math.max(0, expectedIncome - expectedCharges - rolloverQuotas - savingsTarget)
  );
  return {
    expectedIncome,
    expectedCharges,
    rolloverQuotas,
    savingsTarget,
    variableBudget,
    assignedVariable,
    assignmentGap: round(assignedVariable - variableBudget),
    expectedResult: round(
      expectedIncome - expectedCharges - rolloverQuotas - variableBudget
    ),
  };
}

export interface AccrualInputs {
  /** Matched planned items of this budget month, at their ACTUAL amounts. */
  matchedCredit: number;
  matchedDebit: number;
  /** Unmatched (no planned item), non-transfer flows of the calendar month. */
  unmatchedCredit: number;
  unmatchedDebit: number;
}

export interface ActualResult {
  actualIncome: number;
  actualExpenses: number;
  actualResult: number;
}

/**
 * The month's real result under ACCRUAL: a matched transaction counts in its
 * planned item's budget month (the mortgage charged on 2 Aug still belongs to
 * July's books), everything unmatched counts by its own date. A café on the
 * 1st of August is August's.
 */
export function computeActualResult(input: AccrualInputs): ActualResult {
  const actualIncome = round(input.matchedCredit + input.unmatchedCredit);
  const actualExpenses = round(input.matchedDebit + input.unmatchedDebit);
  return {
    actualIncome,
    actualExpenses,
    actualResult: round(actualIncome - actualExpenses),
  };
}

/** performance = real − expected. Positive = the month beat its plan. */
export function performance(actualResult: number, expectedResult: number): number {
  return round(actualResult - expectedResult);
}

/**
 * The free reconciliation check: income − expenses should equal the
 * consolidated balance change. A gap means uncaptured flow — an unsynced
 * account, a sync hole. Shown, never hidden. Null when balances are unknown.
 */
export function reconciliationGap(
  consolidatedDelta: number | null,
  actualResult: number
): number | null {
  if (consolidatedDelta == null) return null;
  return round(consolidatedDelta - actualResult);
}

export interface RolloverMonthRow {
  assigned: number;
  spent: number;
}

/**
 * A rollover fund's balance: every month's assignment minus what its category
 * actually spent, summed since the fund began. Derived, never stored. These
 * funds are ACCOUNTING SMOOTHING, not a pot of money — their one job is that
 * the 600 € IBI doesn't wreck September.
 */
export function rolloverBalance(rows: RolloverMonthRow[]): number {
  return round(rows.reduce((sum, r) => sum + r.assigned - r.spent, 0));
}

/** Months the consolidated balance covers at the average monthly spend. */
export function monthsOfCushion(
  consolidatedBalance: number | null,
  avgMonthlySpend: number
): number | null {
  if (consolidatedBalance == null || avgMonthlySpend <= 0) return null;
  return Math.round((consolidatedBalance / avgMonthlySpend) * 10) / 10;
}
