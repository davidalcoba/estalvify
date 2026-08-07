// Daily closing balances derived from `balance_after_transaction`.
//
// WHY THIS EXISTS. The balances endpoint only ever answers "what is the
// balance right now", so a balance row can only be written on a day the sync
// actually runs. When a PSD2 consent expires and nobody reconnects for eight
// weeks, the transactions all arrive later — the transactions endpoint takes a
// date range and backfills happily — but those eight weeks of balances are
// gone for good. Observed in production: balance snapshots stop on 7 June and
// resume on 3 August, while July's 112 transactions are all present.
//
// The damage is not cosmetic. `buildMonthStatus` takes the last snapshot
// before the month as its opening balance, so August opened on a 7 June
// figure: the month's "balance change" silently became a two-month change,
// carrying June's and July's salaries inside it, and the reconciliation check
// reported 7.544 € of unexplained movement in a month where nothing was
// actually unexplained.
//
// Enable Banking already sends the fix and we were throwing it away:
// every transaction can carry `balance_after_transaction`, the bank's own
// running balance at that point. Recording the last one of each day gives a
// daily closing balance that backfills WITH the transactions, so a sync
// outage no longer leaves a permanent hole.
//
// WHY IT DOES NOT MAKE THE RECONCILIATION CHECK CIRCULAR. The figure comes
// from the bank, not from summing our own rows. If a transaction never
// reached us, the bank's running balance still jumped by its amount and our
// sum did not — which is precisely what the check is looking for. Deriving
// the balance by adding up our transactions instead would have forced the gap
// to zero and quietly deleted the check.

import type { EnableBankingTransaction } from "./enable-banking";

/** Marks a row as derived from a transaction rather than read from /balances. */
export const AFTER_TRANSACTION = "afterTransaction";

export interface DailyBalance {
  /** YYYY-MM-DD */
  date: string;
  balance: string;
  currency: string;
}

function dateOf(tx: EnableBankingTransaction): string | null {
  const raw = tx.booking_date ?? tx.value_date ?? tx.transaction_date;
  return raw ? raw.slice(0, 10) : null;
}

/**
 * One closing balance per day, from the transactions of a single account.
 *
 * ORDERING. Enable Banking returns a page newest-first, so the FIRST
 * transaction seen for a date is that day's last and its
 * `balance_after_transaction` is the day's close. Pages are fed in the order
 * the API returns them, so passing several pages in sequence keeps that
 * property. Where a bank orders a day's transactions differently the figure
 * lands somewhere inside the day rather than at its end — still the bank's own
 * balance for that date, and still incomparably better than a snapshot eight
 * weeks stale.
 *
 * Days whose transactions carry no `balance_after_transaction` are skipped:
 * the field is optional in the API and not every bank populates it. Skipping
 * leaves the previous behaviour untouched rather than inventing a number.
 *
 * MEASURED, 2026-08-07: **BBVA sends the field and sets it to `null`** on every
 * transaction. The key name is right — it is there among the 24 the API
 * returns — the bank simply does not fill it. So this produces nothing for
 * BBVA today and the July hole cannot be repaired from the API at all: PSD2
 * has no historical-balance endpoint either, `/balances` answers only for
 * right now. It is kept because it is correct and free for any connection
 * that does populate the field, and because the alternative — deriving the
 * balance from our own transactions — would force the reconciliation gap to
 * zero and delete the check that surfaced this in the first place.
 */
export function dailyClosingBalances(
  transactions: EnableBankingTransaction[]
): DailyBalance[] {
  const byDate = new Map<string, DailyBalance>();
  for (const tx of transactions) {
    const after = tx.balance_after_transaction;
    if (!after?.amount) continue;
    const date = dateOf(tx);
    if (!date) continue;
    if (byDate.has(date)) continue; // first seen wins — see ORDERING above
    byDate.set(date, {
      date,
      balance: after.amount,
      currency: after.currency ?? tx.transaction_amount.currency,
    });
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}
