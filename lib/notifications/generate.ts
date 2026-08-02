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
import {
  lastNMonths,
  forwardMonths,
  monthlyIncomeExpenses,
} from "@/lib/analytics/trends";
import {
  averageMonthly,
  projectBalances,
  projectBalancesVariable,
} from "@/lib/analytics/forecast";
import { buildBudgetData } from "@/lib/budget/budget-dto";
import {
  plannedForMonth,
  plannedMonthlyByCategory,
  type PlanItemInput,
} from "@/lib/plan/plan-item";
import {
  budgetNotifications,
  upcomingRecurringNotifications,
  lowBalanceNotifications,
  consentExpiringNotifications,
  staleTransactionNotifications,
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
export async function generateNotificationsForUser(
  userId: string,
): Promise<number> {
  const prefs = await getUserPrefs(userId);
  const { year, month } = currentYearMonth(prefs.timezone);

  // Forecast baseline: the 6 full months ending last month.
  const prevMonth =
    month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const fullMonths = lastNMonths(prevMonth.year, prevMonth.month, 6);
  const trendStart = monthRange(fullMonths[0].year, fullMonths[0].month).start;

  const [
    planItems,
    spendingRows,
    categories,
    recurring,
    accounts,
    trendTx,
    connections,
    lastTxByAccount,
  ] = await Promise.all([
    prisma.planItem.findMany({
      where: { userId, active: true },
      select: {
        direction: true,
        categoryId: true,
        amount: true,
        cadence: true,
        onDate: true,
        endDate: true,
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
      select: {
        id: true,
        name: true,
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
    prisma.bankConnection.findMany({
      // Every status: a lapsed consent is exactly the case worth reporting.
      where: { userId },
      select: {
        id: true,
        bankName: true,
        consentExpiresAt: true,
        status: true,
      },
    }),
    prisma.transaction.groupBy({
      by: ["bankAccountId"],
      where: { userId },
      _max: { valueDate: true },
    }),
  ]);

  const spendingByCategory = aggregateSpendingByCategory(spendingRows);

  // Per-category limits come from the Plan (steady monthly expense total). Feed
  // them into buildBudgetData as synthesized items so the budget-over/near alerts
  // keep working against planned-vs-actual.
  const planInputs: PlanItemInput[] = planItems.map((p) => ({
    direction: p.direction,
    categoryId: p.categoryId,
    amount: Number(p.amount.toString()),
    cadence: p.cadence,
    onDate: p.onDate ? p.onDate.toISOString().slice(0, 10) : null,
    endDate: p.endDate ? p.endDate.toISOString().slice(0, 10) : null,
  }));
  const limitByCategory = plannedMonthlyByCategory(planInputs, { year, month });
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const planItemRecords = Object.entries(limitByCategory)
    .map(([categoryId, planned]) => {
      const category = categoryById.get(categoryId);
      if (!category) return null;
      return {
        categoryId,
        plannedAmount: planned,
        currency: prefs.currency,
        category: { name: category.name, color: category.color },
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const budgetData = buildBudgetData({
    year,
    month,
    currency: prefs.currency,
    items: planItemRecords,
    spendingByCategory,
    categories,
  });

  const today = todayInTimezone(prefs.timezone);

  // Project the balance forward and alert if it dips below zero. Plan-driven when
  // there is a Plan; otherwise the historical average.
  const netWorth = accounts.reduce(
    (sum, a) =>
      sum + (a.balances[0] ? Number(a.balances[0].balance.toString()) : 0),
    0,
  );
  const trend = monthlyIncomeExpenses(
    trendTx.map((t) => ({
      amount: Number(t.amount.toString()),
      direction: t.direction,
      valueDate: t.valueDate.toISOString(),
      categoryKind: t.categorization?.category?.kind ?? null,
    })),
    fullMonths,
  );
  const avg = averageMonthly(trend);
  const horizon = forwardMonths(year, month, FORECAST_MONTHS);
  const projected =
    planInputs.length > 0
      ? projectBalancesVariable(
          netWorth,
          horizon,
          horizon.map(
            (b) =>
              Math.round(
                planInputs.reduce(
                  (sum, item) => sum + plannedForMonth(item, b.year, b.month),
                  0,
                ) * 100,
              ) / 100,
          ),
        )
      : projectBalances(netWorth, avg.net, horizon);

  const specs: NotificationSpec[] = [
    ...budgetNotifications(
      year,
      month,
      budgetData.rows,
      prefs.currency,
      prefs.locale,
    ),
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
      prefs.locale,
    ),
    ...lowBalanceNotifications(
      projected,
      0,
      prefs.currency,
      prefs.locale,
      prefs.language,
    ),
    ...consentExpiringNotifications(
      connections
        .filter((c) => c.status !== "REVOKED")
        .map((c) => ({
          connectionId: c.id,
          bankName: c.bankName,
          consentExpiresAt: c.consentExpiresAt
            ? c.consentExpiresAt.toISOString().slice(0, 10)
            : null,
        })),
      today,
      prefs.language,
    ),
    ...staleTransactionNotifications(
      accounts.map((a) => ({
        accountId: a.id,
        accountName: a.name,
        lastTransactionDate:
          lastTxByAccount
            .find((g) => g.bankAccountId === a.id)
            ?._max.valueDate?.toISOString()
            .slice(0, 10) ?? null,
      })),
      today,
    ),
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
          ...(spec.metadata
            ? { metadata: spec.metadata as Prisma.InputJsonValue }
            : {}),
        },
        // Never clobber readAt or re-alert — a matching dedupeKey is a no-op.
        update: {},
      }),
    ),
  );

  return specs.length;
}
