// Pure matching: link an incoming transaction to the planned item that
// expected it, decide when an item is MISSED, and measure how far a matched
// amount strayed from the expected one. No Prisma — unit-tested in isolation.

import { isoDate, resolveWindow, type YearMonth } from "./schedule";

/**
 * Accent-fold, uppercase, and fold every run of punctuation to a single space
 * before collapsing whitespace. Bank descriptors carry noise that splits a
 * merchant name mid-token — the payment-gateway asterisk ("UBER *ONE
 * MEMBERSHIP"), a dot where a name has an apostrophe ("Institut d.Investigacio"
 * vs a matcher written "d'Investigacio"), SEPA reference dashes. Folding all of
 * it to spaces on BOTH the descriptor and the matcher (they share this function)
 * lets a matcher written from the merchant's name match the raw feed. Digits are
 * kept — amounts and account fragments can be part of a descriptor.
 */
export function normalizeDescriptor(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Tolerance window: how far a transaction may arrive before/after the expected
 * window and still match — CROSSING the month border, so a mortgage expected on
 * 31 July that charges on 2 August still pairs with July's planned item and is
 * booked in July (accrual).
 */
export const MATCH_LEAD_DAYS = 5;
export const MATCH_LAG_DAYS = 7;
/**
 * MISSED fires when the TOLERANCE window closes (windowEnd + lag), not when the
 * expected date passes — a charge sliding three days is normal, not missing.
 */
export const MISSED_GRACE_DAYS = MATCH_LAG_DAYS;
/** Relative amount tolerance for the category+amount fallback match. */
export const AMOUNT_TOLERANCE = 0.25;
/** Relative deviation of a matched amount that triggers a price-change alert. */
export const DEVIATION_THRESHOLD = 0.15;
/**
 * Hard cap on the relative deviation a descriptor match may carry. Bank
 * descriptors collide ("TRANSPORTE Y ALQUILER DE VEHICULOS" contains
 * ALQUILER; both insurances read "BBVA PLAN ESTARSEGURO") — the amount is
 * what tells a 1.389 € rent from a 19 € taxi and the 59 € policy from the
 * 11 € one. Generous enough to survive a real price change (O2: +52%).
 */
export const MAX_MATCH_DEVIATION = 0.75;

export interface PlannedForMatch {
  id: string;
  direction: "DEBIT" | "CREDIT";
  amount: number;
  /** Normalized text to look for in descriptors (series matcher or description). */
  matcher: string;
  /**
   * Rule-linked series: the rule's condition tree decides recognition instead
   * of the matcher text (the caller builds the predicate). Amount guards and
   * FIFO still apply on top.
   */
  matches?: (tx: TransactionForMatch) => boolean;
  /**
   * A period that carries SEVERAL charges of this series (school fees split
   * into base + activities + materials; association dues billed as separate
   * SEPA debits). When true the item absorbs every recognized arrival in the
   * window and matchedAmount is their sum — the per-transaction amount guard is
   * skipped, so recognition rests entirely on a specific matcher or a rule.
   * When false (the default) the item expects a single charge, guard and all.
   */
  aggregate?: boolean;
  categoryId: string | null;
  year: number;
  month: number;
  dueDay: number | null;
  windowFromDay: number | null;
  windowToDay: number | null;
  anchorMonthEnd: boolean;
}

export interface TransactionForMatch {
  id: string;
  date: string; // YYYY-MM-DD
  direction: "DEBIT" | "CREDIT";
  amount: number; // absolute
  descriptor: string; // description + remittanceInfo, raw
  categoryId: string | null;
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export interface MatchWindow {
  start: string;
  end: string;
  windowEnd: string;
}

/** Acceptance range for arrivals: the day window widened by lead/lag days. */
export function matchWindow(item: PlannedForMatch): MatchWindow {
  const ym: YearMonth = { year: item.year, month: item.month };
  const window =
    item.dueDay != null && !item.anchorMonthEnd
      ? { fromDay: item.dueDay, toDay: item.dueDay }
      : resolveWindow(item, ym);
  const windowEnd = isoDate(ym, window.toDay);
  return {
    start: addDaysIso(isoDate(ym, window.fromDay), -MATCH_LEAD_DAYS),
    end: addDaysIso(windowEnd, MATCH_LAG_DAYS),
    windowEnd,
  };
}

export interface MatchResult {
  itemId: string;
  /** Primary matched transaction (earliest) — anchors the unique FK. */
  transactionId: string;
  /** Every transaction absorbed by this item (≥1). */
  transactionIds: string[];
  /** SUM of the absorbed transactions' amounts. */
  matchedAmount: number;
  /** Signed relative deviation of the SUM vs the expected amount (null when expected is 0). */
  deviation: number | null;
}

/**
 * Match PENDING items against candidate transactions. Two recognition paths:
 *
 *  - Strong (series with a matcher or a linked rule): AGGREGATE. A period can
 *    carry several charges of the same series — school fees split into base +
 *    activities + materials, association dues billed as separate SEPA debits.
 *    So the item absorbs EVERY transaction its matcher/rule recognizes inside
 *    the window and matchedAmount is their sum. There is no per-transaction
 *    amount guard here: recognition is the specific matcher (audited at save
 *    time to reject a 0-hit or scattered matcher) or the rule's condition tree
 *    (which carries its own amount band, so the twin BBVA policies never mix).
 *    A single-charge series simply sums one transaction — unchanged behaviour.
 *  - Weak (hand-typed one-off, no matcher/rule): the single closest arrival by
 *    same category + amount within tolerance.
 *
 * Each transaction links at most one item. FIFO: items are processed oldest
 * budget month first, so when a delayed charge and the current one share a
 * calendar month, July's item claims the earlier and August's the later
 * instead of August eating both.
 */
export function matchPlannedItems(
  items: PlannedForMatch[],
  transactions: TransactionForMatch[]
): MatchResult[] {
  const results: MatchResult[] = [];
  const usedTx = new Set<string>();

  const ordered = [...items].sort(
    (a, b) =>
      a.year - b.year ||
      a.month - b.month ||
      (a.windowFromDay ?? a.dueDay ?? 1) - (b.windowFromDay ?? b.dueDay ?? 1)
  );

  const push = (item: PlannedForMatch, txs: TransactionForMatch[]): void => {
    const byDate = [...txs].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    for (const tx of byDate) usedTx.add(tx.id);
    const sum = Math.round(byDate.reduce((s, tx) => s + tx.amount, 0) * 100) / 100;
    results.push({
      itemId: item.id,
      transactionId: byDate[0].id,
      transactionIds: byDate.map((tx) => tx.id),
      matchedAmount: sum,
      deviation:
        item.amount > 0 ? Math.round(((sum - item.amount) / item.amount) * 1000) / 1000 : null,
    });
  };

  for (const item of ordered) {
    const { start, end } = matchWindow(item);
    const matcher = normalizeDescriptor(item.matcher);
    const inWindow = (tx: TransactionForMatch) =>
      !usedTx.has(tx.id) &&
      tx.direction === item.direction &&
      tx.date >= start &&
      tx.date <= end;
    const recognizes = (tx: TransactionForMatch) =>
      item.matches
        ? item.matches(tx)
        : matcher.length >= 3 && normalizeDescriptor(tx.descriptor).includes(matcher);

    // Aggregate series: sum every recognized arrival in the window. Recognition
    // is the specific matcher (audited at save) or the rule, so no per-tx guard.
    if (item.aggregate) {
      const claimed = transactions.filter((tx) => inWindow(tx) && recognizes(tx));
      if (claimed.length > 0) push(item, claimed);
      continue;
    }

    // Single-charge series (default): the best individual arrival. Strong =
    // recognized AND amount in the same league (guards rent≠taxi, twin policies
    // by amount); weak = category + amount for matcher-less one-offs. Closest
    // amount wins, then FIFO.
    let best: { tx: TransactionForMatch; strong: boolean; dev: number } | null = null;
    for (const tx of transactions) {
      if (!inWindow(tx)) continue;
      const dev = item.amount > 0 ? Math.abs(tx.amount - item.amount) / item.amount : 0;
      const strong = recognizes(tx) && dev <= MAX_MATCH_DEVIATION;
      const weak =
        !strong &&
        !item.matches &&
        item.categoryId !== null &&
        tx.categoryId === item.categoryId &&
        item.amount > 0 &&
        dev <= AMOUNT_TOLERANCE;
      if (!strong && !weak) continue;
      if (
        !best ||
        (strong && !best.strong) ||
        (strong === best.strong && dev < best.dev - 1e-9) ||
        (strong === best.strong && Math.abs(dev - best.dev) <= 1e-9 && tx.date < best.tx.date)
      ) {
        best = { tx, strong, dev };
      }
    }
    if (best) push(item, [best.tx]);
  }
  return results;
}

/** Whether a still-PENDING item's window has closed beyond the grace period. */
export function isMissed(item: PlannedForMatch, today: string): boolean {
  const { windowEnd } = matchWindow(item);
  return today > addDaysIso(windowEnd, MISSED_GRACE_DAYS);
}

/** Where `today` sits relative to an item's ACCEPTANCE window (lead/lag included). */
export type WindowStatus = "FUTURE" | "OPEN" | "CLOSED";

export function windowStatusFor(
  item: Pick<
    PlannedForMatch,
    "year" | "month" | "dueDay" | "windowFromDay" | "windowToDay" | "anchorMonthEnd"
  >,
  today: string
): WindowStatus {
  const { start, end } = matchWindow(item as PlannedForMatch);
  if (today < start) return "FUTURE";
  if (today > end) return "CLOSED";
  return "OPEN";
}

/** Deviation worth alerting (the O2 58 → 88.28 case), or null. */
export function significantDeviation(
  deviation: number | null,
  threshold: number = DEVIATION_THRESHOLD
): number | null {
  if (deviation == null || Math.abs(deviation) < threshold) return null;
  return Math.round(deviation * 1000) / 1000;
}

/**
 * A month is PROVISIONAL while last month's charges can still slide into it —
 * i.e. until the tolerance window of a month-end charge has fully closed.
 * Otherwise the performance number changes on the 3rd with no explanation.
 */
export function isProvisionalMonth(today: string): boolean {
  return Number(today.slice(8, 10)) <= MATCH_LAG_DAYS;
}
