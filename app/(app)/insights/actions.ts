"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getUserPrefs } from "@/lib/user-prefs";
import { formatDate } from "@/lib/formatters";
import {
  currentYearMonth,
  monthRange,
  buildMonthlySpendingWhere,
  aggregateSpendingByCategory,
} from "@/lib/analytics/spending";
import {
  lastNMonths,
  forwardMonths,
  monthlyIncomeExpenses,
  topCategories,
} from "@/lib/analytics/trends";
import { averageMonthly, projectBalances } from "@/lib/analytics/forecast";
import { buildBudgetData } from "@/lib/budget/budget-dto";
import {
  getAiProvider,
  buildFinancialSummary,
  AiNotConfiguredError,
  type AiRecommendation,
} from "@/lib/ai";

const HISTORY_MONTHS = 6;
const HORIZON_MONTHS = 6;

export type InsightsResult =
  | { status: "ok"; recommendations: AiRecommendation[] }
  | { status: "empty" }
  | { status: "not_configured"; message: string }
  | { status: "error"; message: string };

export async function generateInsights(): Promise<InsightsResult> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  const userId = session.user.id;
  const { locale, language, timezone, currency } = await getUserPrefs(userId);

  const { year, month } = currentYearMonth(timezone);
  const prev =
    month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const fullMonths = lastNMonths(prev.year, prev.month, HISTORY_MONTHS);
  const trendStart = monthRange(fullMonths[0].year, fullMonths[0].month).start;

  const [accounts, trendTx, spendRows, categories, plannedDebits, recurring] =
    await Promise.all([
      prisma.bankAccount.findMany({
        where: { userId, isActive: true },
        select: {
          balances: {
            orderBy: { date: "desc" },
            take: 1,
            select: { balance: true },
          },
        },
      }),
      prisma.transaction.findMany({
        where: { userId, valueDate: { gte: trendStart } },
        select: {
          amount: true,
          direction: true,
          valueDate: true,
          // Category kind so transfers can be excluded from income/expense totals.
          categorization: { select: { category: { select: { kind: true } } } },
        },
      }),
      prisma.transaction.findMany({
        where: buildMonthlySpendingWhere(userId, year, month),
        select: {
          amount: true,
          categorization: { select: { categoryId: true } },
        },
      }),
      prisma.category.findMany({
        where: { isActive: true, OR: [{ userId }, { userId: null }] },
        select: { id: true, name: true, color: true, parentId: true },
      }),
      prisma.plannedItem.findMany({
        where: { userId, year, month, direction: "DEBIT" },
        select: { categoryId: true, amount: true },
      }),
      prisma.recurringSeries.findMany({
        where: { userId, active: true },
        select: { direction: true, cadence: true, expectedAmount: true },
      }),
    ]);

  if (accounts.length === 0 && trendTx.length === 0) {
    return { status: "empty" };
  }

  const netWorth = accounts.reduce(
    (sum, a) =>
      sum + (a.balances[0] ? Number(a.balances[0].balance.toString()) : 0),
    0,
  );

  const rows = trendTx.map((t) => ({
    amount: Number(t.amount.toString()),
    direction: t.direction,
    valueDate: t.valueDate.toISOString(),
    categoryKind: t.categorization?.category?.kind ?? null,
  }));
  const trend = monthlyIncomeExpenses(rows, fullMonths);
  const avg = averageMonthly(trend);
  const current = monthlyIncomeExpenses(rows, [{ year, month }])[0];
  const projected = projectBalances(
    netWorth,
    avg.net,
    forwardMonths(year, month, HORIZON_MONTHS),
  );

  const spendingByCategory = aggregateSpendingByCategory(spendRows);

  // Per-category "planned" figures come from this month's planned items;
  // synthesize budget-item records so buildBudgetData (planned-vs-actual)
  // keeps working for the AI summary.
  const limitByCategory: Record<string, number> = {};
  for (const p of plannedDebits) {
    if (!p.categoryId) continue;
    limitByCategory[p.categoryId] =
      (limitByCategory[p.categoryId] ?? 0) + Number(p.amount.toString());
  }
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const planItemRecords = Object.entries(limitByCategory)
    .map(([categoryId, planned]) => {
      const category = categoryById.get(categoryId);
      if (!category) return null;
      return {
        categoryId,
        plannedAmount: planned,
        currency,
        category: { name: category.name, color: category.color },
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const budgetData = buildBudgetData({
    year,
    month,
    currency,
    items: planItemRecords,
    spendingByCategory,
    categories,
  });

  const CADENCE_PER_MONTH: Record<string, number> = {
    WEEKLY: 52 / 12,
    MONTHLY: 1,
    BIMONTHLY: 1 / 2,
    QUARTERLY: 1 / 3,
    YEARLY: 1 / 12,
  };
  let monthlyRecurringExpenses = 0;
  for (const r of recurring) {
    if (r.direction !== "DEBIT") continue;
    const factor = CADENCE_PER_MONTH[r.cadence];
    if (!factor) continue;
    monthlyRecurringExpenses += Number(r.expectedAmount.toString()) * factor;
  }

  const summary = buildFinancialSummary({
    currency,
    locale,
    monthLabel: formatDate(
      new Date(Date.UTC(year, month - 1, 1)),
      language,
      "UTC",
      {
        month: "long",
        year: "numeric",
      },
    ),
    income: current.income,
    expenses: current.expenses,
    avgMonthlyNet: avg.net,
    netWorth,
    projectedBalanceEndOfHorizon: projected.length
      ? projected[projected.length - 1].balance
      : null,
    topCategories: topCategories(spendingByCategory, categories, 6).map(
      (c) => ({
        name: c.name,
        amount: c.amount,
      }),
    ),
    budget: budgetData.rows.map((r) => ({
      name: r.categoryName,
      planned: r.planned,
      spent: r.spent,
      status: r.status,
    })),
    confirmedRecurringCount: recurring.length,
    monthlyRecurringExpenses,
  });

  try {
    const provider = getAiProvider({ locale });
    const recommendations = await provider.generateRecommendations(summary);
    return { status: "ok", recommendations };
  } catch (error) {
    if (error instanceof AiNotConfiguredError) {
      return {
        status: "not_configured",
        message:
          "AI insights aren't configured. Set ANTHROPIC_API_KEY (and optionally AI_MODEL) to enable them.",
      };
    }
    return {
      status: "error",
      message: "Couldn't generate insights right now. Please try again.",
    };
  }
}
