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

/** Days a transaction may arrive before/after the window and still match. */
export const MATCH_LEAD_DAYS = 3;
export const MATCH_LAG_DAYS = 7;
/** Days past the window's end before a PENDING item turns MISSED. */
export const MISSED_GRACE_DAYS = 5;
/** Relative amount tolerance for the category+amount fallback match. */
export const AMOUNT_TOLERANCE = 0.25;
/** Relative deviation of a matched amount that triggers a price-change alert. */
export const DEVIATION_THRESHOLD = 0.15;

export interface PlannedForMatch {
  id: string;
  direction: "DEBIT" | "CREDIT";
  amount: number;
  /** Normalized text to look for in descriptors (series matcher or description). */
  matcher: string;
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
 * at most one item and vice versa; ties resolve to the arrival closest to the
 * window.
 */
export function matchPlannedItems(
  items: PlannedForMatch[],
  transactions: TransactionForMatch[]
): MatchResult[] {
  const results: MatchResult[] = [];
  const usedTx = new Set<string>();

  for (const item of items) {
    const { start, end } = matchWindow(item);
    const matcher = normalizeDescriptor(item.matcher);

    let best: { tx: TransactionForMatch; strong: boolean; distance: number } | null =
      null;
    for (const tx of transactions) {
      if (usedTx.has(tx.id)) continue;
      if (tx.direction !== item.direction) continue;
      if (tx.date < start || tx.date > end) continue;

      const strong =
        matcher.length >= 3 && normalizeDescriptor(tx.descriptor).includes(matcher);
      const amountOk =
        item.amount > 0 &&
        Math.abs(tx.amount - item.amount) / item.amount <= AMOUNT_TOLERANCE;
      const weak =
        !strong && item.categoryId !== null && tx.categoryId === item.categoryId && amountOk;
      if (!strong && !weak) continue;

      const distance = Math.abs(Date.parse(tx.date) - Date.parse(start));
      if (
        !best ||
        (strong && !best.strong) ||
        (strong === best.strong && distance < best.distance)
      ) {
        best = { tx, strong, distance };
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
