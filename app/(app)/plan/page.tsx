// Monthly control view: the cascade (base income − planned − fund quotas −
// savings goal = variable budget) and the rollover funds' state. Control, not
// operations — the operating number lives on the dashboard, weekly.

import type { Metadata } from "next";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getUserPrefs } from "@/lib/user-prefs";
import { buildMonthStatus } from "@/lib/budget/month-status";
import { syncPlannedState } from "@/lib/planned/engine";
import { PageHeader } from "@/components/layout/page-header";
import { CascadeCard } from "@/components/budget/cascade-card";
import { FundsCard } from "@/components/budget/funds-card";

export const metadata: Metadata = { title: "Monthly control" };

export default async function PlanPage() {
  const session = await auth();
  const userId = session!.user.id;
  const prefs = await getUserPrefs(userId);

  await syncPlannedState(userId, prefs.timezone, prefs.currency, prefs.locale);
  const [status, categories] = await Promise.all([
    buildMonthStatus(userId, prefs.timezone),
    prisma.category.findMany({
      where: { isActive: true, OR: [{ userId }, { userId: null }] },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, color: true, parentId: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Monthly control" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CascadeCard status={status} currency={prefs.currency} locale={prefs.locale} />
        <FundsCard
          funds={status.funds}
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
