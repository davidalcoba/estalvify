// Budget view: the cascade whose bottom line is the expected result (the
// goal), and the category objectives judged against the month's pace.
// Control, not operations — the operating number lives on the dashboard,
// weekly. Navigable month by month (?y=&m=): past months are read as closed
// (pace = 100%), future ones arrive already assigned via propagation.
//
// The month shell is a client component: changing month swaps the cards to
// the skeleton on the click itself (useTransition), while the slow work
// (sync + status build) streams behind the Suspense boundary.

import type { Metadata } from "next";
import { Suspense } from "react";
import { requireScope } from "@/lib/auth/scope";
import { prisma } from "@/lib/prisma";
import { getUserPrefs } from "@/lib/user-prefs";
import { buildMonthStatus } from "@/lib/budget/month-status";
import { currentYearMonth } from "@/lib/analytics/spending";
import { syncPlannedState } from "@/lib/planned/engine";
import { MonthShell, BudgetBodySkeleton } from "@/components/budget/month-shell";
import { CascadeCard } from "@/components/budget/cascade-card";
import { ObjectivesCard } from "@/components/budget/objectives-card";

export const metadata: Metadata = { title: "Budget" };

interface PageProps {
  searchParams: Promise<{ y?: string; m?: string }>;
}

async function PlanBody({
  userId,
  target,
  prefs,
  isCurrent,
}: {
  userId: string;
  target: { year: number; month: number };
  prefs: { timezone: string; currency: string; locale: string };
  isCurrent: boolean;
}) {
  // The planned-state sync (generation + matching) is the expensive step and
  // only the current month's numbers depend on it being fresh this second —
  // navigation to other months reads already-settled state, so it skips it.
  if (isCurrent) {
    await syncPlannedState(userId, prefs.timezone, prefs.currency, prefs.locale);
  }
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
        incomeObjectives={status.incomeObjectives}
        control={status.control}
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
  const { dataUserId: userId, actorUserId } = await requireScope("read");
  const [prefs, params] = await Promise.all([getUserPrefs(userId, actorUserId), searchParams]);

  const current = currentYearMonth(prefs.timezone);
  const y = Number(params.y);
  const m = Number(params.m);
  const target =
    Number.isInteger(y) && Number.isInteger(m) && m >= 1 && m <= 12 && Math.abs(y - current.year) <= 10
      ? { year: y, month: m }
      : current;
  const isCurrent = target.year === current.year && target.month === current.month;

  return (
    <MonthShell
      year={target.year}
      month={target.month}
      isCurrent={isCurrent}
      // Dates render with the language preference, not the number locale —
      // same split Settings applies everywhere else.
      locale={prefs.language}
    >
      <Suspense key={`${target.year}-${target.month}`} fallback={<BudgetBodySkeleton />}>
        <PlanBody userId={userId} target={target} prefs={prefs} isCurrent={isCurrent} />
      </Suspense>
    </MonthShell>
  );
}
