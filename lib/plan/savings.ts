// Pure savings-tracking helpers. The app cannot move money — the standing
// order lives at the bank. What it can do: size the goal, detect whether the
// transfer actually ran this month, and measure real savings.
//
// Real savings is measured as the NET change of the savings account's balance,
// not as the sum of transfers into it: moving 1.000 € over to cover rent and
// pulling it back is churn, not saving. Only what stays counts.

const round = (n: number) => Math.round(n * 100) / 100;

export interface SavingsTransferRow {
  direction: "DEBIT" | "CREDIT";
  amount: number; // absolute
  remittanceInfo: string | null;
  description: string | null;
  /** Category kind when categorized — TRANSFER marks own-account moves. */
  categoryKind?: "EXPENSE" | "INCOME" | "TRANSFER" | null;
}

/** Matches the bank's transfer wording on either descriptor (TRASPASO…). */
export function looksLikeTransfer(row: SavingsTransferRow): boolean {
  if (row.categoryKind === "TRANSFER") return true;
  const text = `${row.description ?? ""} ${row.remittanceInfo ?? ""}`.toUpperCase();
  return text.includes("TRASPASO");
}

export interface MonthTransferActivity {
  /** Money moved INTO the savings account by transfer this month. */
  transferredIn: number;
  /** Money moved OUT of the savings account by transfer this month. */
  transferredOut: number;
  /** At least one inbound transfer landed this month. */
  executed: boolean;
}

/**
 * Transfer activity on the savings account for the month, from that account's
 * own transactions (CREDIT = money arriving into savings).
 */
export function monthTransferActivity(
  savingsAccountRows: SavingsTransferRow[]
): MonthTransferActivity {
  let transferredIn = 0;
  let transferredOut = 0;
  for (const row of savingsAccountRows) {
    if (!looksLikeTransfer(row)) continue;
    const amount = Math.abs(row.amount);
    if (!Number.isFinite(amount)) continue;
    if (row.direction === "CREDIT") transferredIn += amount;
    else transferredOut += amount;
  }
  return {
    transferredIn: round(transferredIn),
    transferredOut: round(transferredOut),
    executed: transferredIn > 0,
  };
}

/**
 * Net savings for the month: latest balance minus the balance entering the
 * month. Null when either snapshot is missing (a young account, a dead sync) —
 * an unknown is more honest than a zero.
 */
export function netSavingsChange(
  balanceAtMonthStart: number | null,
  latestBalance: number | null
): number | null {
  if (balanceAtMonthStart == null || latestBalance == null) return null;
  return round(latestBalance - balanceAtMonthStart);
}
