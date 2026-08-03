// Pure duplicate-charge detection: group a user's transactions into clusters that
// look like the same operation posted more than once. No Prisma/network —
// unit-tested in isolation; the caller passes plain rows in.
//
// The bank-side id already guards the boring case: `@@unique([bankAccountId,
// externalTransactionId])` means the same operation can never be imported twice.
// What is left is the expensive case this module is for — the merchant (or the
// bank) genuinely charging twice: a double tap on the card terminal, a retried
// payment that both went through, a direct debit presented twice.
//
// Nothing here is deleted or merged. A cluster is a *suspicion*: two identical
// coffees on the same afternoon are indistinguishable from one coffee billed
// twice, so the guardrails below exist to keep the suspicion rate low enough to
// be worth a notification.

import { normalizeMerchantKey, merchantDisplayName, daysBetween } from "@/lib/recurring/detect";
import type { Direction } from "@/lib/recurring/detect";

export interface DuplicateInput {
  id: string;
  bankAccountId: string;
  accountName: string;
  /**
   * Signed or unsigned — only the magnitude is used, `direction` carries the
   * sign. Banks are inconsistent about whether a debit arrives negative, which
   * is why `rules/apply.ts`, `recurring/detect.ts` and `analytics/trends.ts` all
   * take the absolute value too.
   */
  amount: number;
  direction: Direction;
  valueDate: string; // YYYY-MM-DD (or anything Date can parse)
  description: string | null;
  remittanceInfo: string | null;
}

export interface DuplicateGroup {
  bankAccountId: string;
  accountName: string;
  merchantKey: string;
  displayName: string;
  direction: Direction;
  /** Always the positive magnitude, whatever sign the input carried. */
  amount: number;
  count: number;
  firstDate: string; // YYYY-MM-DD
  lastDate: string; // YYYY-MM-DD
  /** Whole days between the first and last charge in the cluster. */
  spanDays: number;
  transactionIds: string[];
}

/**
 * How far apart two identical charges can be and still read as one duplicated
 * operation. Kept tight on purpose: the shortest recurring cadence the app
 * recognises is weekly (`CADENCE_BUCKETS`), so a 3-day window cannot mistake a
 * legitimate subscription for a double charge.
 */
export const DUPLICATE_WINDOW_DAYS = 3;

/**
 * Charges below this are not reported. Small identical amounts repeat honestly
 * all the time — two metro tickets, two coffees, two identical bread runs — and
 * at that size the notification costs more attention than the money it protects.
 */
export const DUPLICATE_MIN_AMOUNT = 10;

/** Cents, so 24.99 groups by an integer instead of a float. */
function cents(amount: number): number {
  return Math.round(amount * 100);
}

function toDateOnly(value: string): string {
  const d = new Date(value);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate()
  ).padStart(2, "0")}`;
}

/**
 * Cluster identical charges that landed close together.
 *
 * A cluster needs *all* of: same account, same direction, the same amount to the
 * cent, and the same normalized merchant key. Anything looser produced obvious
 * nonsense — two different €30 purchases on the same day are not a duplicate of
 * each other.
 *
 * The merchant key comes from `normalizeMerchantKey`, which drops digits, dates
 * and known bank prefixes but keeps whole words — so a duplicate whose descriptor
 * differs by more than a reference number ("NETFLIX" vs "NETFLIX COM") is missed.
 * That is the intended trade: this alert must not cry wolf, and a looser key
 * merges genuinely different merchants.
 *
 * Within a bucket, dates are chained rather than compared to the first one: a
 * charge repeated on days 1, 3 and 5 is one run of three, not two overlapping
 * pairs. That also means a long tail of a genuinely repeating charge collapses
 * into a single (large) cluster instead of N pairs.
 */
export function findDuplicateGroups(
  rows: DuplicateInput[],
  options: { windowDays?: number; minAmount?: number } = {}
): DuplicateGroup[] {
  const windowDays = options.windowDays ?? DUPLICATE_WINDOW_DAYS;
  const minAmount = options.minAmount ?? DUPLICATE_MIN_AMOUNT;

  const buckets = new Map<string, DuplicateInput[]>();
  for (const row of rows) {
    const amount = Math.abs(row.amount);
    if (!Number.isFinite(amount) || amount < minAmount) continue;
    const merchantKey = normalizeMerchantKey(row.description, row.remittanceInfo);
    // No usable descriptor means no way to tell "the same charge twice" from
    // "two charges of the same size". Guessing here is how you cry wolf.
    if (!merchantKey) continue;

    const key = `${row.bankAccountId}|${row.direction}|${cents(amount)}|${merchantKey}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(row);
    else buckets.set(key, [row]);
  }

  const groups: DuplicateGroup[] = [];
  for (const bucket of buckets.values()) {
    if (bucket.length < 2) continue;

    const sorted = [...bucket].sort(
      (a, b) => new Date(a.valueDate).getTime() - new Date(b.valueDate).getTime()
    );

    let run: DuplicateInput[] = [sorted[0]];
    const flush = () => {
      if (run.length < 2) return;
      const first = run[0];
      const last = run[run.length - 1];
      groups.push({
        bankAccountId: first.bankAccountId,
        accountName: first.accountName,
        merchantKey: normalizeMerchantKey(first.description, first.remittanceInfo),
        displayName: merchantDisplayName(first.description, first.remittanceInfo),
        direction: first.direction,
        amount: Math.abs(first.amount),
        count: run.length,
        firstDate: toDateOnly(first.valueDate),
        lastDate: toDateOnly(last.valueDate),
        spanDays: daysBetween(first.valueDate, last.valueDate),
        // Stable order (oldest first) so a caller can key off these safely.
        transactionIds: run.map((r) => r.id),
      });
    };

    for (const row of sorted.slice(1)) {
      const gap = daysBetween(run[run.length - 1].valueDate, row.valueDate);
      if (gap <= windowDays) {
        run.push(row);
      } else {
        flush();
        run = [row];
      }
    }
    flush();
  }

  // Newest cluster first — the one still worth disputing.
  return groups.sort((a, b) => (a.lastDate < b.lastDate ? 1 : a.lastDate > b.lastDate ? -1 : 0));
}
