// Monthly control view: the cascade whose bottom line is the expected result
// (the goal), and the category objectives judged against the month's pace.
// Control, not operations — the operating number lives on the dashboard,
// weekly. Navigable month by month (?y=&m=): past months are read as closed
// (pace = 100%), future ones arrive already assigned via propagation.

import type { Metadata } from "next";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getUserPrefs } from "@/lib/user-prefs";
import { buildMonthStatus } from "@/lib/budget/month-status";
import { currentYearMonth } from "@/lib/analytics/spending";
import { syncPlannedState } from "@/lib/planned/engine";
import { PageHeader } from "@/components/layout/page-header";
import { CascadeCard } from "@/components/budget/cascade-card";
import { ObjectivesCard } from "@/components/budget/objectives-card";
import { MonthNav } from "@/components/budget/month-nav";

export const metadata: Metadata = { title: "Monthly control" };

interface PageProps {
  searchParams: Promise<{ y?: string; m?: string }>;
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
    <div className="space-y-6">
      <PageHeader
        title="Monthly control"
        actions={
          <MonthNav
            year={status.year}
            month={status.month}
            isCurrent={isCurrent}
            locale={prefs.locale}
          />
        }
      />
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
    </div>
  );
}
