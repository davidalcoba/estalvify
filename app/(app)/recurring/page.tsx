// Recurring — the hand-maintained registry of standing charges and income.
// Each series generates dated planned items forward (see /forecast) and the
// matcher links the bank's arrivals back, which is what powers the deviation
// and missed-charge alerts.

import type { Metadata } from "next";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getUserPrefs } from "@/lib/user-prefs";
import { PageHeader } from "@/components/layout/page-header";
import { SeriesManager, type SeriesVM } from "@/components/recurring/series-manager";

export const metadata: Metadata = { title: "Recurring" };

export default async function RecurringPage() {
  const session = await auth();
  const userId = session!.user.id;
  const prefs = await getUserPrefs(userId);

  const [series, categories, accounts] = await Promise.all([
    prisma.recurringSeries.findMany({
      where: { userId },
      orderBy: [{ direction: "asc" }, { expectedAmount: "desc" }],
    }),
    prisma.category.findMany({
      where: { isActive: true, OR: [{ userId }, { userId: null }] },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, color: true, parentId: true },
    }),
    prisma.bankAccount.findMany({
      where: { userId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const vms: SeriesVM[] = series.map((s) => ({
    id: s.id,
    displayName: s.displayName,
    matcher: s.merchantKey,
    direction: s.direction,
    categoryId: s.categoryId,
    bankAccountId: s.bankAccountId,
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
        categories={categories}
        accounts={accounts}
        currency={prefs.currency}
        locale={prefs.locale}
      />
    </div>
  );
}
