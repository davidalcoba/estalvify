import "server-only";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma";
import { getUserPrefs } from "@/lib/user-prefs";
import {
  currentYearMonth,
  monthRange,
  buildMonthlySpendingWhere,
  aggregateSpendingByCategory,
} from "@/lib/analytics/spending";
import { lastNMonths, forwardMonths, monthlyIncomeExpenses } from "@/lib/analytics/trends";
import { averageMonthly, projectBalances } from "@/lib/analytics/forecast";
import { buildBudgetData } from "@/lib/budget/budget-dto";
import {
  budgetNotifications,
  upcomingRecurringNotifications,
  lowBalanceNotifications,
  type NotificationSpec,
} from "./generators";

const FORECAST_MONTHS = 6;

/** Today's date (YYYY-MM-DD) in a given IANA timezone. */
function todayInTimezone(timezone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * Generate this user's notifications from their current budget and recurring
 * data, upserting by (userId, dedupeKey) so re-runs never duplicate and never
 * clobber an already-read notification. Returns the number of specs processed.
 */
export async function generateNotificationsForUser(userId: string): Promise<number> {
  const prefs = await getUserPrefs(userId);
  const { year, month } = currentYearMonth(prefs.timezone);

  // Forecast baseline: the 6 full months ending last month.
  const prevMonth = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const fullMonths = lastNMonths(prevMonth.year, prevMonth.month, 6);
  const trendStart = monthRange(fullMonths[0].year, fullMonths[0].month).start;

  const [budget, spendingRows, categories, recurring, accounts, trendTx] = await Promise.all([
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
      select: { id: true, name: true, color: true, parentId: true },
    }),
    prisma.recurringSeries.findMany({
      where: { userId, status: "CONFIRMED", nextExpectedDate: { not: null } },
      select: {
        merchantKey: true,
        displayName: true,
        direction: true,
        averageAmount: true,
        nextExpectedDate: true,
      },
    }),
    prisma.bankAccount.findMany({
      where: { userId, isActive: true },
      select: { balances: { orderBy: { date: "desc" }, take: 1, select: { balance: true } } },
    }),
    prisma.transaction.findMany({
      where: { userId, valueDate: { gte: trendStart } },
      select: { amount: true, direction: true, valueDate: true },
    }),
  ]);

  const spendingByCategory = aggregateSpendingByCategory(spendingRows);
  const budgetData = buildBudgetData({
    year,
    month,
    currency: prefs.currency,
    items: budget?.budgetItems ?? [],
    spendingByCategory,
    categories,
  });

  const today = todayInTimezone(prefs.timezone);

  // Project the balance forward and alert if it dips below zero.
  const netWorth = accounts.reduce(
    (sum, a) => sum + (a.balances[0] ? Number(a.balances[0].balance.toString()) : 0),
    0
  );
  const trend = monthlyIncomeExpenses(
    trendTx.map((t) => ({
      amount: Number(t.amount.toString()),
      direction: t.direction,
      valueDate: t.valueDate.toISOString(),
    })),
    fullMonths
  );
  const avg = averageMonthly(trend);
  const projected = projectBalances(netWorth, avg.net, forwardMonths(year, month, FORECAST_MONTHS));

  const specs: NotificationSpec[] = [
    ...budgetNotifications(year, month, budgetData.rows, prefs.currency, prefs.locale),
    ...upcomingRecurringNotifications(
      recurring.map((r) => ({
        merchantKey: r.merchantKey,
        displayName: r.displayName,
        direction: r.direction,
        averageAmount: Number(r.averageAmount.toString()),
        nextExpectedDate: r.nextExpectedDate
          ? r.nextExpectedDate.toISOString().slice(0, 10)
          : null,
      })),
      today,
      prefs.currency,
      prefs.locale
    ),
    ...lowBalanceNotifications(projected, 0, prefs.currency, prefs.locale, prefs.language),
  ];

  if (specs.length === 0) return 0;

  await prisma.$transaction(
    specs.map((spec) =>
      prisma.notification.upsert({
        where: { userId_dedupeKey: { userId, dedupeKey: spec.dedupeKey } },
        create: {
          userId,
          type: spec.type,
          severity: spec.severity,
          title: spec.title,
          body: spec.body,
          dedupeKey: spec.dedupeKey,
          ...(spec.metadata ? { metadata: spec.metadata as Prisma.InputJsonValue } : {}),
        },
        // Never clobber readAt or re-alert — a matching dedupeKey is a no-op.
        update: {},
      })
    )
  );

  return specs.length;
}
