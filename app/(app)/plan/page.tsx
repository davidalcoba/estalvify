// Plan page — manual cash-flow planning. The single place to declare expected
// income and expenses (multiple per category, with cadences). A category's
// planned monthly total acts as its limit vs real spending, and the Forecast
// projects from these entries.

import type { Metadata } from "next";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getUserPrefs } from "@/lib/user-prefs";
import {
  buildMonthlySpendingWhere,
  aggregateSpendingByCategory,
  currentYearMonth,
} from "@/lib/analytics/spending";
import { buildPlanData } from "@/lib/plan/plan-dto";
import { buildMonthStatus } from "@/lib/plan/month-status";
import { PlanView } from "@/components/plan/plan-view";
import { CommitmentsCard } from "@/components/plan/commitments-card";

export const metadata: Metadata = { title: "Plan" };

export default async function PlanPage() {
  const session = await auth();
  const userId = session!.user.id;
  const prefs = await getUserPrefs(userId);

  const { year, month } = currentYearMonth(prefs.timezone);

  const monthStatusPromise = buildMonthStatus(userId, prefs.timezone);
  const [planItems, spendingRows, categories] = await Promise.all([
    prisma.planItem.findMany({
      where: { userId, active: true },
      select: {
        id: true,
        label: true,
        direction: true,
        categoryId: true,
        amount: true,
        currency: true,
        cadence: true,
        dayOfMonth: true,
        onDate: true,
        endDate: true,
        recurringMerchantKey: true,
      },
    }),
    prisma.transaction.findMany({
      where: buildMonthlySpendingWhere(userId, year, month),
      select: {
        amount: true,
        categorization: { select: { categoryId: true } },
        splits: { select: { amount: true, categoryId: true } },
      },
    }),
    prisma.category.findMany({
      where: { isActive: true, OR: [{ userId }, { userId: null }] },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, color: true, parentId: true },
    }),
  ]);

  const spendingByCategory = aggregateSpendingByCategory(spendingRows);
  const data = buildPlanData({
    currency: prefs.currency,
    items: planItems,
    spendingByCategory,
    categories,
    ref: { year, month },
  });
  const monthStatus = await monthStatusPromise;

  return (
    <PlanView
      data={data}
      categories={categories}
      locale={prefs.locale}
      currency={prefs.currency}
      dateLocale={prefs.language}
      commitmentsSlot={
        <CommitmentsCard
          status={monthStatus}
          currency={prefs.currency}
          locale={prefs.locale}
        />
      }
    />
  );
}
