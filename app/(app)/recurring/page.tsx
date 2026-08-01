// Recurring page — subscriptions and regular payments detected from bank history.
// Candidates are detected live from the last ~13 months of transactions; the
// user's confirm/ignore decisions are stored in RecurringSeries.

import type { Metadata } from "next";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getUserPrefs } from "@/lib/user-prefs";
import { detectRecurringSeries, type DetectionInput } from "@/lib/recurring/detect";
import { mergeRecurring, summarizeRecurring } from "@/lib/recurring/recurring-dto";
import { RecurringView } from "@/components/recurring/recurring-view";

export const metadata: Metadata = { title: "Recurring" };

// How far back to scan for repeating patterns (yearly series need >1 year).
const LOOKBACK_MONTHS = 13;

export default async function RecurringPage() {
  const session = await auth();
  const userId = session!.user.id;
  const prefs = await getUserPrefs(userId);

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
        categorization: {
          select: {
            categoryId: true,
            category: { select: { name: true, color: true } },
          },
        },
      },
      orderBy: { valueDate: "asc" },
    }),
    prisma.recurringSeries.findMany({
      where: { userId },
      select: { merchantKey: true, status: true },
    }),
  ]);

  const rows: DetectionInput[] = transactions.map((tx) => ({
    amount: Number(tx.amount.toString()),
    direction: tx.direction,
    valueDate: tx.valueDate.toISOString(),
    description: tx.description,
    remittanceInfo: tx.remittanceInfo,
    categoryId: tx.categorization?.categoryId ?? null,
    categoryName: tx.categorization?.category?.name ?? null,
    categoryColor: tx.categorization?.category?.color ?? null,
  }));

  const candidates = detectRecurringSeries(rows);
  const items = mergeRecurring(candidates, stored);
  const summary = summarizeRecurring(items);

  return (
    <RecurringView
      items={items}
      summary={summary}
      currency={prefs.currency}
      locale={prefs.locale}
    />
  );
}
