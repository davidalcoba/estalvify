import "server-only";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma";
import { getUserPrefs } from "@/lib/user-prefs";
import {
  currentYearMonth,
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
  detectRecurringSeries,
  type DetectionInput,
  type RecurringCandidate,
} from "@/lib/recurring/detect";
import {
  detectAmountDeviation,
  detectMissedSeries,
} from "@/lib/recurring/alerts";
import { buildCashflowData } from "@/lib/analytics/cashflow-data";
import { buildMonthStatus } from "@/lib/plan/month-status";
import {
  budgetNotifications,
  upcomingRecurringNotifications,
  recurringAmountChangeNotifications,
  missedRecurringNotifications,
  lowBalanceNotifications,
  cashflowBreachNotifications,
  savingsNotExecutedNotifications,
  consentExpiringNotifications,
  staleTransactionNotifications,
  type AmountChangeInput,
  type MissedSeriesInput,
  type NotificationSpec,
} from "./generators";

const FORECAST_MONTHS = 6;

// Keep in sync with the Recurring page / review-count detection window.
const DETECTION_LOOKBACK_MONTHS = 13;

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

  // Longer window for recurring detection (see DETECTION_LOOKBACK_MONTHS).
  const detectionStart = new Date();
  detectionStart.setUTCMonth(detectionStart.getUTCMonth() - DETECTION_LOOKBACK_MONTHS);
  detectionStart.setUTCHours(0, 0, 0, 0);

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
        splits: { select: { amount: true, categoryId: true } },
      },
    }),
    prisma.category.findMany({
      where: { isActive: true, OR: [{ userId }, { userId: null }] },
      select: { id: true, name: true, color: true, parentId: true },
    }),
    prisma.recurringSeries.findMany({
      where: { userId, status: "CONFIRMED" },
      select: {
        merchantKey: true,
        displayName: true,
        direction: true,
        averageAmount: true,
        nextExpectedDate: true,
        lastSeenAt: true,
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
      // One scan covers both consumers: the income/expense trend (last 6 full
      // months) and recurring detection, which wants the longer window so a
      // quarterly/yearly series still has enough occurrences.
      where: { userId, valueDate: { gte: detectionStart } },
      select: {
        amount: true,
        direction: true,
        valueDate: true,
        description: true,
        remittanceInfo: true,
        // Category kind so transfers can be excluded from income/expense totals.
        categorization: { select: { category: { select: { kind: true } } } },
      },
      orderBy: { valueDate: "asc" },
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

  // Day-level cash-flow projection per account (the "will rent clear before
  // the salary lands" alert) and the month's savings/commitments position.
  // Both share their math with the pages that display them.
  const [cashflow, monthStatus] = await Promise.all([
    buildCashflowData(userId, prefs.timezone, 60),
    buildMonthStatus(userId, prefs.timezone),
  ]);

  // ── Recurring series: live detection ────────────────────────────────────
  // Stored rows are snapshots from the moment the user confirmed; their dates
  // and amounts go stale as charges keep arriving. Alerts are computed from a
  // fresh detection pass, and the stored snapshots (plus their mirrored plan
  // items) are refreshed on the way so the rest of the app stays accurate.
  const detectionRows: DetectionInput[] = trendTx.map((t) => ({
    amount: Number(t.amount.toString()),
    direction: t.direction,
    valueDate: t.valueDate.toISOString(),
    description: t.description,
    remittanceInfo: t.remittanceInfo,
  }));
  const candidates = detectRecurringSeries(detectionRows);
  const liveByKey = new Map<string, RecurringCandidate>(
    candidates.map((c) => [c.merchantKey, c]),
  );

  const storedByKey = new Map(recurring.map((r) => [r.merchantKey, r]));
  const liveConfirmed = candidates.filter((c) => storedByKey.has(c.merchantKey));

  const snapshotUpdates = liveConfirmed.filter((c) => {
    const stored = storedByKey.get(c.merchantKey)!;
    return (
      Number(stored.averageAmount.toString()) !== c.averageAmount ||
      (stored.lastSeenAt?.toISOString().slice(0, 10) ?? null) !== c.lastSeen ||
      (stored.nextExpectedDate?.toISOString().slice(0, 10) ?? null) !==
        c.nextExpected
    );
  });
  if (snapshotUpdates.length > 0) {
    await prisma.$transaction(
      snapshotUpdates.flatMap((c) => [
        prisma.recurringSeries.update({
          where: { userId_merchantKey: { userId, merchantKey: c.merchantKey } },
          data: {
            averageAmount: c.averageAmount,
            cadence: c.cadence,
            lastSeenAt: new Date(`${c.lastSeen}T00:00:00Z`),
            nextExpectedDate: new Date(`${c.nextExpected}T00:00:00Z`),
          },
        }),
        // Auto-linked plan items mirror the series; keep the mirror true so the
        // forecast and category limits track reality (a rent raise included).
        prisma.planItem.updateMany({
          where: { userId, recurringMerchantKey: c.merchantKey },
          data: { amount: c.averageAmount, cadence: c.cadence },
        }),
      ]),
    );
  }

  const amountChanges: AmountChangeInput[] = [];
  const missedSeries: MissedSeriesInput[] = [];
  for (const c of liveConfirmed) {
    const deviation = detectAmountDeviation(c.history);
    if (deviation) {
      amountChanges.push({
        merchantKey: c.merchantKey,
        displayName: c.displayName,
        ...deviation,
      });
    }
    const missed = detectMissedSeries(c.nextExpected, today);
    if (missed) {
      missedSeries.push({
        merchantKey: c.merchantKey,
        displayName: c.displayName,
        direction: c.direction,
        averageAmount: c.averageAmount,
        ...missed,
      });
    }
  }

  // Upcoming charges: live dates where detection still sees the series, stored
  // snapshot as fallback (a yearly series may not have enough occurrences in
  // the detection window to re-detect, but its stored date is still real).
  const upcomingInputs = recurring.map((r) => {
    const live = liveByKey.get(r.merchantKey);
    return {
      merchantKey: r.merchantKey,
      displayName: r.displayName,
      direction: r.direction,
      averageAmount: live?.averageAmount ?? Number(r.averageAmount.toString()),
      nextExpectedDate:
        live?.nextExpected ??
        (r.nextExpectedDate ? r.nextExpectedDate.toISOString().slice(0, 10) : null),
    };
  });

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
      upcomingInputs,
      today,
      prefs.currency,
      prefs.locale,
    ),
    ...recurringAmountChangeNotifications(
      amountChanges,
      prefs.currency,
      prefs.locale,
    ),
    ...missedRecurringNotifications(missedSeries, prefs.currency, prefs.locale),
    ...savingsNotExecutedNotifications(
      {
        savingsGoal: monthStatus.commitments.savingsGoal,
        executed: monthStatus.savings?.activity.executed ?? false,
        tracked: monthStatus.savings !== null,
        year: monthStatus.year,
        month: monthStatus.month,
        dayOfMonth: monthStatus.dayOfMonth,
        daysInMonth: monthStatus.daysInMonth,
      },
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
    ...cashflowBreachNotifications(
      cashflow.accounts
        .filter((a) => a.breach !== null)
        .map((a) => ({
          accountId: a.accountId,
          accountName: a.accountName,
          breachDate: a.breach!.date,
          breachBalance: a.breach!.balance,
          daysAway: a.breach!.daysAway,
          minBalance: a.minBalance,
        })),
      cashflow.threshold,
      today,
      prefs.currency,
      prefs.locale,
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
