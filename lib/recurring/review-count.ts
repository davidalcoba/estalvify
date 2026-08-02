// How many detected series are still waiting for a confirm/ignore decision —
// the number badged on the Recurring nav item.
//
// Detection is not stored: it runs over ~13 months of transactions, which is far
// too heavy to redo in the app shell on every navigation. So the count is cached
// per user and invalidated by tag whenever a decision changes; the TTL covers the
// other way it moves, a sync importing new transactions.

import { unstable_cache, updateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { detectRecurringSeries, type DetectionInput } from "./detect";

// Keep in sync with the Recurring page's detection window.
const LOOKBACK_MONTHS = 13;

const CACHE_TTL_SECONDS = 900; // 15 min — how stale the badge can get after a sync.

function reviewCountTag(userId: string): string {
  return `recurring-review-count:${userId}`;
}

/**
 * Call from a Server Action after a change to the user's recurring decisions:
 * `updateTag` expires the entry immediately, so the badge is right on the very
 * next render instead of a refresh later.
 */
export function invalidateRecurringReviewCount(userId: string): void {
  updateTag(reviewCountTag(userId));
}

async function computeReviewCount(userId: string): Promise<number> {
  const cutoff = new Date();
  cutoff.setUTCMonth(cutoff.getUTCMonth() - LOOKBACK_MONTHS);
  cutoff.setUTCHours(0, 0, 0, 0);

  const [transactions, stored] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId, valueDate: { gte: cutoff } },
      select: {
        amount: true,
        direction: true,
        valueDate: true,
        description: true,
        remittanceInfo: true,
      },
      orderBy: { valueDate: "asc" },
    }),
    prisma.recurringSeries.findMany({ where: { userId }, select: { merchantKey: true } }),
  ]);

  const rows: DetectionInput[] = transactions.map((tx) => ({
    amount: Number(tx.amount.toString()),
    direction: tx.direction,
    valueDate: tx.valueDate.toISOString(),
    description: tx.description,
    remittanceInfo: tx.remittanceInfo,
  }));

  const decided = new Set(stored.map((s) => s.merchantKey));
  return detectRecurringSeries(rows).filter((c) => !decided.has(c.merchantKey)).length;
}

export async function getRecurringReviewCount(userId: string): Promise<number> {
  const cached = unstable_cache(
    () => computeReviewCount(userId),
    ["recurring-review-count", userId],
    { tags: [reviewCountTag(userId)], revalidate: CACHE_TTL_SECONDS }
  );
  return cached();
}
