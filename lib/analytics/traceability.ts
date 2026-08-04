// Pure traceability metrics: how much of the month's spending is opaque —
// cash withdrawn at an ATM (no idea what it bought) and monthly credit-card
// settlements (one aggregated row, the card can't be synced as an account).
// While that share is dark, every budget can be "met" while overspending.
//
// A split line WITH a category counts as traced: breaking a withdrawal into
// what the cash actually bought is exactly how this number goes down.

const round = (n: number) => Math.round(n * 100) / 100;

/** The bank's wording for an ATM cash withdrawal. */
export function isCashWithdrawal(
  description: string | null,
  remittanceInfo: string | null
): boolean {
  const text = `${description ?? ""} ${remittanceInfo ?? ""}`.toUpperCase();
  return text.includes("RET. EFECTIVO") || text.includes("EN CAJERO");
}

/** The bank's wording for the monthly credit-card settlement. */
export function isCardSettlement(
  description: string | null,
  remittanceInfo: string | null
): boolean {
  const text = `${description ?? ""} ${remittanceInfo ?? ""}`.toUpperCase();
  return text.includes("ADEUDO MENSUAL DE TARJETA");
}

export interface TraceabilityRow {
  amount: number; // absolute
  description: string | null;
  remittanceInfo: string | null;
  /** Total of this row's split lines that carry a category (already traced). */
  categorizedSplitTotal?: number;
}

export interface TraceabilityMonth {
  cashWithdrawn: number;
  cardSettled: number;
  /** Of the opaque total, how much splits have since explained. */
  explained: number;
  /** cash + card − explained. */
  untracked: number;
  totalSpend: number;
  /** untracked / totalSpend, 0–1. Zero spend → 0. */
  untrackedRatio: number;
}

/**
 * The month's untracked share. `rows` are the month's DEBIT expense rows
 * (transfers excluded upstream); `totalSpend` their sum.
 */
export function traceabilityForMonth(rows: TraceabilityRow[]): TraceabilityMonth {
  let cashWithdrawn = 0;
  let cardSettled = 0;
  let explained = 0;
  let totalSpend = 0;
  for (const row of rows) {
    const amount = Math.abs(row.amount);
    if (!Number.isFinite(amount)) continue;
    totalSpend += amount;
    const cash = isCashWithdrawal(row.description, row.remittanceInfo);
    const card = !cash && isCardSettlement(row.description, row.remittanceInfo);
    if (!cash && !card) continue;
    if (cash) cashWithdrawn += amount;
    else cardSettled += amount;
    explained += Math.min(amount, row.categorizedSplitTotal ?? 0);
  }
  const untracked = round(Math.max(0, cashWithdrawn + cardSettled - explained));
  return {
    cashWithdrawn: round(cashWithdrawn),
    cardSettled: round(cardSettled),
    explained: round(explained),
    untracked,
    totalSpend: round(totalSpend),
    untrackedRatio:
      totalSpend > 0 ? Math.round((untracked / totalSpend) * 1000) / 1000 : 0,
  };
}
