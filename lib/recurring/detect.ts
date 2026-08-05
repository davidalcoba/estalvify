// Pure detector of POSSIBLE recurring series from the transaction history.
// Detection only ever produces suggestions — the user accepts (and edits:
// amounts are approximate, bills vary) or dismisses; nothing is created
// automatically. A suggestion needs a stable merchant descriptor arriving at
// a near-regular cadence with a near-stable amount; frequent merchants (the
// supermarket) fail the cadence density check, one-offs fail the count check.
//
// No Prisma — unit-tested in isolation.

import { normalizeDescriptor } from "@/lib/planned/matching";

export interface TxForDetection {
  date: string; // YYYY-MM-DD
  amount: number; // absolute
  direction: "DEBIT" | "CREDIT";
  descriptor: string; // description + remittanceInfo, raw
  categoryId: string | null;
}

export type SuggestedCadence = "MONTHLY" | "BIMONTHLY" | "QUARTERLY" | "YEARLY";

export interface SuggestionOccurrence {
  date: string; // YYYY-MM-DD
  amount: number;
}

export interface RecurringSuggestion {
  /** Matcher text the series would use (normalized descriptor prefix). */
  merchantKey: string;
  /** Human name, taken from the most recent raw descriptor. */
  displayName: string;
  direction: "DEBIT" | "CREDIT";
  cadence: SuggestedCadence;
  /** Median amount — approximate by design, the user can edit it. */
  expectedAmount: number;
  windowFromDay: number | null;
  windowToDay: number | null;
  /** Most frequent category among the occurrences. */
  categoryId: string | null;
  occurrences: number;
  lastDate: string;
  /** The transactions behind the proposal, newest first (capped). */
  transactions: SuggestionOccurrence[];
}

const MIN_OCCURRENCES = 3;
const AMOUNT_TOLERANCE = 0.3; // bills vary — ±30% of the median still counts
const CADENCES: { cadence: SuggestedCadence; days: number; slack: number }[] = [
  { cadence: "MONTHLY", days: 30, slack: 8 },
  { cadence: "BIMONTHLY", days: 61, slack: 10 },
  { cadence: "QUARTERLY", days: 91, slack: 12 },
  { cadence: "YEARLY", days: 365, slack: 20 },
];

const round = (n: number) => Math.round(n * 100) / 100;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Normalized descriptor with numbers stripped — invoice ids and dates change
 *  every month and would split one merchant into many keys. */
export function suggestionKey(descriptor: string): string {
  return normalizeDescriptor(descriptor)
    .replace(/\d+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 4)
    .join(" ")
    .slice(0, 60);
}

export function detectRecurringSuggestions(
  txs: TxForDetection[],
  options: {
    /** Normalized matchers of the series that already exist. */
    existingMatchers: string[];
    /** Keys the user already dismissed. */
    dismissedKeys: string[];
    limit?: number;
  }
): RecurringSuggestion[] {
  const dismissed = new Set(options.dismissedKeys);
  const matchers = options.existingMatchers
    .map((m) => normalizeDescriptor(m))
    .filter((m) => m.length >= 3);
  const groups = new Map<string, TxForDetection[]>();
  for (const tx of txs) {
    const key = suggestionKey(tx.descriptor);
    if (key.length < 4) continue;
    const groupKey = `${tx.direction}:${key}`;
    const list = groups.get(groupKey) ?? [];
    list.push(tx);
    groups.set(groupKey, list);
  }

  const suggestions: RecurringSuggestion[] = [];
  for (const [groupKey, group] of groups) {
    const key = groupKey.slice(groupKey.indexOf(":") + 1);
    if (dismissed.has(key)) continue;
    // Already covered by a series: either contains the series matcher or the
    // matcher contains the key (both directions of specificity).
    const covered = matchers.some((m) => key.includes(m) || m.includes(key));
    if (covered) continue;
    if (group.length < MIN_OCCURRENCES) continue;

    const amounts = group.map((t) => t.amount);
    const medAmount = median(amounts);
    if (medAmount <= 0) continue;
    const stable = amounts.filter(
      (a) => Math.abs(a - medAmount) <= medAmount * AMOUNT_TOLERANCE
    ).length;
    if (stable / amounts.length < 0.6) continue;

    const dates = group.map((t) => t.date).sort();
    const intervals: number[] = [];
    for (let i = 1; i < dates.length; i++) {
      intervals.push((Date.parse(dates[i]) - Date.parse(dates[i - 1])) / 86_400_000);
    }
    // A same-day duplicate (split charge) breaks regularity — collapse zeros.
    const realIntervals = intervals.filter((d) => d >= 2);
    if (realIntervals.length < MIN_OCCURRENCES - 1) continue;
    const medInterval = median(realIntervals);
    const match = CADENCES.find((c) => Math.abs(medInterval - c.days) <= c.slack);
    if (!match) continue;
    const regular = realIntervals.filter(
      (d) => Math.abs(d - match.days) <= match.slack
    ).length;
    if (regular / realIntervals.length < 0.6) continue;

    // Day window (monthly-style cadences only; a yearly charge has no
    // meaningful day-of-month window).
    let windowFromDay: number | null = null;
    let windowToDay: number | null = null;
    if (match.cadence !== "YEARLY") {
      const days = group.map((t) => Number(t.date.slice(8, 10)));
      const min = Math.min(...days);
      const max = Math.max(...days);
      if (max - min <= 6) {
        windowFromDay = min;
        windowToDay = max;
      }
    }

    const byDateDesc = [...group].sort((a, b) => (a.date < b.date ? 1 : -1));
    const categoryCounts = new Map<string, number>();
    for (const t of group) {
      if (t.categoryId) {
        categoryCounts.set(t.categoryId, (categoryCounts.get(t.categoryId) ?? 0) + 1);
      }
    }
    const categoryId =
      [...categoryCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    suggestions.push({
      merchantKey: key,
      displayName: byDateDesc[0].descriptor.trim().replace(/\s+/g, " ").slice(0, 60),
      direction: group[0].direction,
      cadence: match.cadence,
      expectedAmount: round(medAmount),
      windowFromDay,
      windowToDay,
      categoryId,
      occurrences: group.length,
      lastDate: byDateDesc[0].date,
      transactions: byDateDesc
        .slice(0, 12)
        .map((t) => ({ date: t.date, amount: round(t.amount) })),
    });
  }

  return suggestions
    .sort((a, b) => b.expectedAmount - a.expectedAmount)
    .slice(0, options.limit ?? 10);
}
