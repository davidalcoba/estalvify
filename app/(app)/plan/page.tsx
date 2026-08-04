// Monthly control view: the cascade whose bottom line is the expected result
// (the goal), and the category objectives judged against the month's pace.
// Control, not operations — the operating number lives on the dashboard,
// weekly. Navigable month by month (?y=&m=): past months are read as closed
// (pace = 100%), future ones arrive already assigned via propagation.
//
// Only the cards re-suspend when the month changes — the header and the month
// nav stay interactive and the skeleton is the navigation feedback (the sync +
// status build is the slow part, so it lives inside the boundary).

import type { Metadata } from "next";
import { Suspense } from "react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getUserPrefs } from "@/lib/user-prefs";
import { buildMonthStatus } from "@/lib/budget/month-status";
import { currentYearMonth } from "@/lib/analytics/spending";
import { syncPlannedState } from "@/lib/planned/engine";
import { PageHeader } from "@/components/layout/page-header";
import { ListCardSkeleton } from "@/components/layout/skeletons";
import { CascadeCard } from "@/components/budget/cascade-card";
import { ObjectivesCard } from "@/components/budget/objectives-card";
import { MonthNav } from "@/components/budget/month-nav";

export const metadata: Metadata = { title: "Monthly control" };

interface PageProps {
  searchParams: Promise<{ y?: string; m?: string }>;
}

function PlanBodySkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <ListCardSkeleton rows={9} titleWidth="w-40" />
      <ListCardSkeleton rows={6} titleWidth="w-44" />
    </div>
  );
}

async function PlanBody({
  userId,
  target,
  prefs,
}: {
  userId: string;
  target: { year: number; month: number };
  prefs: { timezone: string; currency: string; locale: string };
}) {
  await syncPlannedState(userId, prefs.timezone, prefs.currency, prefs.locale);
  const [status, categories] = await Promise.all([
    buildMonthStatus(userId, prefs.timezone, target),
    prisma.category.findMany({
      where: { isActive: true, OR: [{ userId }, { userId: null }] },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, color: true, parentId: true },
    }),
  ]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <CascadeCard status={status} currency={prefs.currency} locale={prefs.locale} />
      <ObjectivesCard
        objectives={status.objectives}
        monthElapsed={status.monthElapsed}
        categories={categories}
        year={status.year}
        month={status.month}
        currency={prefs.currency}
        locale={prefs.locale}
      />
    </div>
  );
}

export default async function PlanPage({ searchParams }: PageProps) {
  const session = await auth();
  const userId = session!.user.id;
  const [prefs, params] = await Promise.all([getUserPrefs(userId), searchParams]);

  const current = currentYearMonth(prefs.timezone);
  const y = Number(params.y);
  const m = Number(params.m);
  const target =
    Number.isInteger(y) && Number.isInteger(m) && m >= 1 && m <= 12 && Math.abs(y - current.year) <= 10
      ? { year: y, month: m }
      : current;
  const isCurrent = target.year === current.year && target.month === current.month;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Monthly control"
        actions={
          <MonthNav
            year={target.year}
            month={target.month}
            isCurrent={isCurrent}
            locale={prefs.locale}
          />
        }
      />
      <Suspense key={`${target.year}-${target.month}`} fallback={<PlanBodySkeleton />}>
        <PlanBody userId={userId} target={target} prefs={prefs} />
      </Suspense>
    </div>
  );
}
