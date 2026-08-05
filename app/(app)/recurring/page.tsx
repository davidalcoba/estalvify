// Recurring — a way of automating the monthly control for repeating charges
// and income: each series feeds its category's objective and generates dated
// planned items forward (Upcoming, cash-flow). The system also scans the
// history for POSSIBLE recurrings and proposes them here; the user accepts
// (editing the approximate amount if needed) or dismisses — nothing is
// created automatically.

import type { Metadata } from "next";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getUserPrefs } from "@/lib/user-prefs";
import { detectRecurringSuggestions } from "@/lib/recurring/detect";
import { PageHeader } from "@/components/layout/page-header";
import { SeriesManager, type SeriesVM } from "@/components/recurring/series-manager";

export const metadata: Metadata = { title: "Recurring" };

const DETECTION_LOOKBACK_DAYS = 210; // 7 months: 3 quarterly hits fit

export default async function RecurringPage() {
  const session = await auth();
  const userId = session!.user.id;
  const prefs = await getUserPrefs(userId);

  const detectionStart = new Date();
  detectionStart.setUTCDate(detectionStart.getUTCDate() - DETECTION_LOOKBACK_DAYS);

  const [series, categories, recentTxs, dismissals] = await Promise.all([
    prisma.recurringSeries.findMany({
      where: { userId },
      orderBy: [{ direction: "asc" }, { expectedAmount: "desc" }],
    }),
    prisma.category.findMany({
      where: { isActive: true, OR: [{ userId }, { userId: null }] },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, color: true, parentId: true },
    }),
    prisma.transaction.findMany({
      where: { userId, valueDate: { gte: detectionStart } },
      select: {
        valueDate: true,
        amount: true,
        direction: true,
        description: true,
        remittanceInfo: true,
        categorization: { select: { categoryId: true, status: true } },
      },
    }),
    prisma.dismissedRecurringSuggestion.findMany({
      where: { userId },
      select: { merchantKey: true },
    }),
  ]);

  const suggestions = detectRecurringSuggestions(
    recentTxs.map((tx) => ({
      date: tx.valueDate.toISOString().slice(0, 10),
      amount: Math.abs(Number(tx.amount.toString())),
      direction: tx.direction,
      descriptor: `${tx.description ?? ""} ${tx.remittanceInfo ?? ""}`,
      categoryId:
        tx.categorization?.status === "APPROVED" ? tx.categorization.categoryId : null,
    })),
    {
      existingMatchers: series.map((s) => s.merchantKey),
      dismissedKeys: dismissals.map((d) => d.merchantKey),
    }
  );

  const vms: SeriesVM[] = series.map((s) => ({
    id: s.id,
    displayName: s.displayName,
    matcher: s.merchantKey,
    direction: s.direction,
    categoryId: s.categoryId,
    cadence: s.cadence,
    expectedAmount: Number(s.expectedAmount.toString()),
    windowFromDay: s.windowFromDay,
    windowToDay: s.windowToDay,
    anchorMonthEnd: s.anchorMonthEnd,
    active: s.active,
    lastSeenAt: s.lastSeenAt?.toISOString().slice(0, 10) ?? null,
  }));

  return (
    <div className="space-y-6">
      <PageHeader title="Recurring" />
      <SeriesManager
        series={vms}
        suggestions={suggestions}
        categories={categories}
        currency={prefs.currency}
        locale={prefs.locale}
      />
    </div>
  );
}
