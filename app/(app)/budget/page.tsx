// Budget page — monthly budget planning by category.
// Zero-based budgeting: plan where every euro goes, then track it against the
// real spending synced from the bank.

import type { Metadata } from "next";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getUserPrefs } from "@/lib/user-prefs";
import { formatDate } from "@/lib/formatters";
import {
  buildMonthlySpendingWhere,
  aggregateSpendingByCategory,
  currentYearMonth,
} from "@/lib/analytics/spending";
import { buildBudgetData } from "@/lib/budget/budget-dto";
import { BudgetView } from "@/components/budget/budget-view";

export const metadata: Metadata = { title: "Budget" };

interface PageProps {
  searchParams: Promise<{ year?: string; month?: string }>;
}

function siblingMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const zeroBased = month - 1 + delta;
  return {
    year: year + Math.floor(zeroBased / 12),
    month: ((zeroBased % 12) + 12) % 12 + 1,
  };
}

export default async function BudgetPage({ searchParams }: PageProps) {
  const session = await auth();
  const userId = session!.user.id;
  const prefs = await getUserPrefs(userId);

  // Resolve the target month: query params override the current month.
  const now = currentYearMonth(prefs.timezone);
  const sp = await searchParams;
  const parsedYear = parseInt(sp.year ?? "", 10);
  const parsedMonth = parseInt(sp.month ?? "", 10);
  const validParams =
    Number.isInteger(parsedYear) && parsedMonth >= 1 && parsedMonth <= 12;
  const year = validParams ? parsedYear : now.year;
  const month = validParams ? parsedMonth : now.month;

  const prev = siblingMonth(year, month, -1);
  const next = siblingMonth(year, month, 1);

  const [budget, spendingRows, categories, previousItemCount] = await Promise.all([
    prisma.budget.findUnique({
      where: { userId_year_month: { userId, year, month } },
      select: {
        budgetItems: {
          select: {
            categoryId: true,
            plannedAmount: true,
            currency: true,
            category: { select: { name: true, color: true } },
          },
        },
      },
    }),
    prisma.transaction.findMany({
      where: buildMonthlySpendingWhere(userId, year, month),
      select: { amount: true, categorization: { select: { categoryId: true } } },
    }),
    prisma.category.findMany({
      where: { isActive: true, OR: [{ userId }, { userId: null }] },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, color: true, parentId: true },
    }),
    prisma.budgetItem.count({
      where: { budget: { userId, year: prev.year, month: prev.month } },
    }),
  ]);

  const spendingByCategory = aggregateSpendingByCategory(spendingRows);
  const data = buildBudgetData({
    year,
    month,
    currency: prefs.currency,
    items: budget?.budgetItems ?? [],
    spendingByCategory,
    categories,
  });

  // Format the label from a UTC-anchored date, read back in UTC to avoid drift.
  const monthLabel = formatDate(new Date(Date.UTC(year, month - 1, 1)), prefs.locale, "UTC", {
    month: "long",
    year: "numeric",
  });

  return (
    <BudgetView
      data={data}
      categories={categories}
      monthLabel={monthLabel}
      prevHref={`/budget?year=${prev.year}&month=${prev.month}`}
      nextHref={`/budget?year=${next.year}&month=${next.month}`}
      hasPreviousBudget={previousItemCount > 0}
      locale={prefs.locale}
      currency={prefs.currency}
    />
  );
}
