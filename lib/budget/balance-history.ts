// The consolidated balance at a past date, anchored on real bank readings.
//
// THE PROBLEM THIS SOLVES. `/balances` only ever answers "what is the balance
// right now", so the balance history is a diary: a row exists for a day only
// if the sync ran that day. When a PSD2 consent lapsed and went eight weeks
// unnoticed, July got no rows at all, and asking for "the last balance before
// August" reached back to 7 JUNE — turning August's saving into a two-month
// change carrying two salaries.
//
// WHY DERIVING IS SAFE HERE, HAVING BEEN REJECTED TWICE. Deriving a balance by
// summing our own transactions, on its own, is circular: the reconciliation
// check compares the balance change against those same transactions, so it
// would report zero by construction and quietly stop detecting anything. What
// removes the circularity is ANCHORING. The endpoints come from the bank; the
// ledger only interpolates between them. And the anchors can be checked
// against each other — measured on production, 7 June to 7 August: the two
// real readings differ by 4.405,18 € and 487 transactions explain 4.371,69 €
// of it, a 33,49 € residue over two months. That agreement is what licenses
// the interpolation, and `anchorGap` below is what keeps checking it.
//
// So the reconciliation check does not disappear, it moves: from "does each
// month's balance change match its flows" — which needs a perfect daily
// history that PSD2 cannot guarantee — to "do two real bank readings agree
// with the ledger between them", which survives a sync outage and still
// catches genuinely uncaptured flow.

const round = (n: number) => Math.round(n * 100) / 100;

export interface BalanceAnchor {
  /** YYYY-MM-DD */
  date: string;
  /** Consolidated across every account, as the bank reported it. */
  balance: number;
}

/**
 * The anchor needing the shortest walk to `target`, so the fewest transactions
 * stand between a bank reading and the answer. A tie goes to the earlier one,
 * which is the settled side of the pair.
 */
export function pickAnchor(
  anchors: BalanceAnchor[],
  target: string
): BalanceAnchor | null {
  let best: BalanceAnchor | null = null;
  let bestDistance = Infinity;
  for (const a of anchors) {
    const distance = Math.abs(dayDiff(a.date, target));
    if (distance < bestDistance) {
      best = a;
      bestDistance = distance;
    }
  }
  return best;
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function dayDiff(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/**
 * The window whose flows separate an anchor from a target: always half-open on
 * the left, `(after, upTo]`, because a balance is stated at the END of its
 * day. Walking forward the flows are added, walking back they are subtracted —
 * which the caller does with `balanceAt`.
 */
export function walkWindow(
  anchorDate: string,
  target: string
): { after: string; upTo: string; forward: boolean } {
  const forward = dayDiff(anchorDate, target) >= 0;
  return forward
    ? { after: anchorDate, upTo: target, forward }
    : { after: target, upTo: anchorDate, forward };
}

/**
 * The consolidated balance at the end of `target`.
 *
 * `netFlow` is credits minus debits over exactly the window `walkWindow`
 * returned — transfers between the user's own accounts included, since they
 * net to zero across a consolidated total and excluding them would only open a
 * hole when one leg is miscategorised.
 */
export function balanceAt(
  anchor: BalanceAnchor,
  target: string,
  netFlow: number
): number {
  const { forward } = walkWindow(anchor.date, target);
  return round(anchor.balance + (forward ? netFlow : -netFlow));
}

/**
 * How much of the change between two real bank readings the ledger fails to
 * explain. This is the reconciliation check: both ends come from the bank, the
 * middle from our transactions, so a non-zero result is flow we never saw.
 * Null when there are not two distinct anchors to compare.
 */
export function anchorGap(
  earlier: BalanceAnchor | null,
  later: BalanceAnchor | null,
  netFlowBetween: number
): number | null {
  if (!earlier || !later || earlier.date === later.date) return null;
  return round(later.balance - earlier.balance - netFlowBetween);
}
