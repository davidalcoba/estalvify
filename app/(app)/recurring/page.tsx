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
import { detectRecurringSuggestions, suggestionKey } from "@/lib/recurring/detect";
import { PageHeader } from "@/components/layout/page-header";
import {
  SeriesManager,
  type SeriesVM,
  type SeriesPrefill,
} from "@/components/recurring/series-manager";

export const metadata: Metadata = { title: "Recurring" };

const DETECTION_LOOKBACK_DAYS = 210; // 7 months: 3 quarterly hits fit

interface PageProps {
  searchParams: Promise<{ fromTx?: string }>;
}

export default async function RecurringPage({ searchParams }: PageProps) {
  const session = await auth();
  const userId = session!.user.id;
  const [prefs, params] = await Promise.all([getUserPrefs(userId), searchParams]);

  const detectionStart = new Date();
  detectionStart.setUTCDate(detectionStart.getUTCDate() - DETECTION_LOOKBACK_DAYS);

  const [series, categories, recentTxs, dismissals, rules] = await Promise.all([
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
        merchant: true,
        categorization: { select: { categoryId: true, status: true } },
      },
    }),
    prisma.dismissedRecurringSuggestion.findMany({
      where: { userId },
      select: { merchantKey: true },
    }),
    prisma.categoryRule.findMany({
      where: { userId, isActive: true },
      orderBy: { priority: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const suggestions = detectRecurringSuggestions(
    recentTxs.map((tx) => ({
      date: tx.valueDate.toISOString().slice(0, 10),
      amount: Math.abs(Number(tx.amount.toString())),
      direction: tx.direction,
      descriptor: `${tx.description ?? ""} ${tx.remittanceInfo ?? ""}`,
      merchant: tx.merchant,
      categoryId:
        tx.categorization?.status === "APPROVED" ? tx.categorization.categoryId : null,
    })),
    {
      existingMatchers: series.map((s) => s.merchantKey),
      dismissedKeys: dismissals.map((d) => d.merchantKey),
    }
  );

  // "Make recurring" from a transaction: the tx knows the real bank
  // descriptor, so the form arrives with the matcher already right.
  let prefill: SeriesPrefill | null = null;
  if (params.fromTx) {
    const tx = await prisma.transaction.findFirst({
      where: { id: params.fromTx, userId },
      select: {
        description: true,
        remittanceInfo: true,
        direction: true,
        amount: true,
        valueDate: true,
        categorization: { select: { categoryId: true, status: true } },
      },
    });
    if (tx) {
      const descriptor = `${tx.description ?? ""} ${tx.remittanceInfo ?? ""}`
        .replace(/\s+/g, " ")
        .trim();
      const day = tx.valueDate.getUTCDate();
      prefill = {
        displayName: descriptor.slice(0, 60),
        matcher: suggestionKey(descriptor),
        direction: tx.direction,
        categoryId:
          tx.categorization?.status === "APPROVED" ? tx.categorization.categoryId : null,
        expectedAmount: String(Math.abs(Number(tx.amount.toString()))),
        windowFromDay: String(Math.max(1, day - 2)),
        windowToDay: String(Math.min(31, day + 2)),
      };
    }
  }

  const vms: SeriesVM[] = series.map((s) => ({
    id: s.id,
    displayName: s.displayName,
    matcher: s.merchantKey,
    direction: s.direction,
    categoryId: s.categoryId,
    ruleId: s.ruleId,
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
        prefill={prefill}
        rules={rules}
        categories={categories}
        currency={prefs.currency}
        locale={prefs.locale}
      />
    </div>
  );
}
