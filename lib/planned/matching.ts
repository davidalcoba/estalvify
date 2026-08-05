// Pure matching: link an incoming transaction to the planned item that
// expected it, decide when an item is MISSED, and measure how far a matched
// amount strayed from the expected one. No Prisma — unit-tested in isolation.

import { isoDate, resolveWindow, type YearMonth } from "./schedule";

/** Accent-fold + uppercase + collapse whitespace (mirrors the rule engine). */
export function normalizeDescriptor(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
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
  transactionId: string;
  matchedAmount: number;
  /** Signed relative deviation vs the expected amount (null when expected is 0). */
  deviation: number | null;
}

/**
 * Match PENDING items against candidate transactions. Strong signal is the
 * descriptor containing the item's matcher; the fallback for matcher-less
 * one-offs is same category + amount within tolerance. Each transaction links
 * at most one item and vice versa.
 *
 * FIFO: items are processed oldest budget month first and each takes the
 * EARLIEST matching arrival, so when two charges of the same series land in
 * one calendar month (the delayed one and the current one), the first pairs
 * with July's planned item and the second with August's — instead of August
 * eating both and July reading zero.
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

  for (const item of ordered) {
    const { start, end } = matchWindow(item);
    const matcher = normalizeDescriptor(item.matcher);

    let best: { tx: TransactionForMatch; strong: boolean; dev: number } | null = null;
    for (const tx of transactions) {
      if (usedTx.has(tx.id)) continue;
      if (tx.direction !== item.direction) continue;
      if (tx.date < start || tx.date > end) continue;

      const dev =
        item.amount > 0 ? Math.abs(tx.amount - item.amount) / item.amount : 0;
      const recognized = item.matches
        ? item.matches(tx)
        : matcher.length >= 3 && normalizeDescriptor(tx.descriptor).includes(matcher);
      // Descriptor recognition alone is not enough — the amount must be in
      // the same league, or the rent matches a taxi (see MAX_MATCH_DEVIATION).
      const strong = recognized && dev <= MAX_MATCH_DEVIATION;
      const weak =
        !strong &&
        !item.matches &&
        item.categoryId !== null &&
        tx.categoryId === item.categoryId &&
        item.amount > 0 &&
        dev <= AMOUNT_TOLERANCE;
      if (!strong && !weak) continue;

      // Preference: strong beats weak, then the closest amount (what tells
      // twin merchants apart), then FIFO — the earliest arrival wins.
      if (
        !best ||
        (strong && !best.strong) ||
        (strong === best.strong && dev < best.dev - 1e-9) ||
        (strong === best.strong && Math.abs(dev - best.dev) <= 1e-9 && tx.date < best.tx.date)
      ) {
        best = { tx, strong, dev };
      }
    }

    if (best) {
      usedTx.add(best.tx.id);
      results.push({
        itemId: item.id,
        transactionId: best.tx.id,
        matchedAmount: best.tx.amount,
        deviation:
          item.amount > 0
            ? Math.round(((best.tx.amount - item.amount) / item.amount) * 1000) / 1000
            : null,
      });
    }
  }
  return results;
}

/** Whether a still-PENDING item's window has closed beyond the grace period. */
export function isMissed(item: PlannedForMatch, today: string): boolean {
  const { windowEnd } = matchWindow(item);
  return today > addDaysIso(windowEnd, MISSED_GRACE_DAYS);
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
