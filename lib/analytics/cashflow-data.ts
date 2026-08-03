// Assembles the daily cash-flow projection for a user: per-account balances,
// scheduled events from confirmed recurring series, and a variable-spend rate
// from recent history. Shared by the Forecast page and the notification cron so
// the curve the user sees and the alert that fires are the same numbers.
//
// The pure math lives in `lib/analytics/cashflow.ts`; this module is the one
// place that talks to Prisma for it.

import "server-only";

import { prisma } from "@/lib/prisma";
import {
  detectRecurringSeries,
  normalizeMerchantKey,
  type DetectionInput,
} from "@/lib/recurring/detect";
import {
  addDays,
  scheduleSeries,
  projectAccountDaily,
  consolidateDaily,
  firstBreach,
  dailyVariableSpend,
  type ScheduledEvent,
  type DailyPoint,
  type CashflowBreach,
} from "./cashflow";

// Keep in sync with the Recurring page / review-count detection window.
const DETECTION_LOOKBACK_MONTHS = 13;
// Variable spend rate window. Spec'd on daily averages, not monthly ones: a
// month is too coarse to feed a per-day curve.
const VARIABLE_SPEND_WINDOW_DAYS = 90;

export interface AccountCashflow {
  accountId: string;
  accountName: string;
  startingBalance: number;
  minBalance: number;
  minDate: string;
  dailyVariableSpend: number;
  breach: CashflowBreach | null;
  points: DailyPoint[];
}

export interface UpcomingEvent extends ScheduledEvent {
  accountName: string;
  daysAway: number;
}

export interface CashflowData {
  today: string; // YYYY-MM-DD (user timezone)
  horizonDays: number;
  threshold: number;
  accounts: AccountCashflow[];
  consolidated: DailyPoint[];
  consolidatedBreach: CashflowBreach | null;
  upcomingEvents: UpcomingEvent[];
}

/** Today's date (YYYY-MM-DD) in a given IANA timezone. */
function todayInTimezone(timezone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export async function buildCashflowData(
  userId: string,
  timezone: string,
  horizonDays = 60
): Promise<CashflowData> {
  const today = todayInTimezone(timezone);
  const horizonEnd = addDays(today, horizonDays);

  const detectionStart = new Date();
  detectionStart.setUTCMonth(
    detectionStart.getUTCMonth() - DETECTION_LOOKBACK_MONTHS
  );
  detectionStart.setUTCHours(0, 0, 0, 0);

  const [user, accounts, transactions, confirmed] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { lowBalanceThreshold: true },
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
      where: { userId, valueDate: { gte: detectionStart } },
      select: {
        amount: true,
        direction: true,
        valueDate: true,
        description: true,
        remittanceInfo: true,
        bankAccountId: true,
        categorization: {
          select: { category: { select: { kind: true } } },
        },
      },
      orderBy: { valueDate: "asc" },
    }),
    prisma.recurringSeries.findMany({
      where: { userId, status: "CONFIRMED" },
      select: { merchantKey: true },
    }),
  ]);

  const threshold = user ? Number(user.lowBalanceThreshold.toString()) : 0;
  const confirmedKeys = new Set(confirmed.map((s) => s.merchantKey));

  const detectionRows: DetectionInput[] = transactions.map((t) => ({
    amount: Number(t.amount.toString()),
    direction: t.direction,
    valueDate: t.valueDate.toISOString(),
    description: t.description,
    remittanceInfo: t.remittanceInfo,
    bankAccountId: t.bankAccountId,
  }));
  const confirmedSeries = detectRecurringSeries(detectionRows).filter((c) =>
    confirmedKeys.has(c.merchantKey)
  );

  // Fallback account for a series whose rows carried no account (shouldn't
  // happen here, but detection allows it): the account with most transactions.
  const txCountByAccount = new Map<string, number>();
  for (const t of transactions) {
    txCountByAccount.set(
      t.bankAccountId,
      (txCountByAccount.get(t.bankAccountId) ?? 0) + 1
    );
  }
  const busiestAccountId =
    [...txCountByAccount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  // Scheduled events per account, from each confirmed series' own rhythm.
  const eventsByAccount = new Map<string, ScheduledEvent[]>();
  const confirmedDebitKeys = new Set<string>();
  for (const series of confirmedSeries) {
    if (series.direction === "DEBIT") confirmedDebitKeys.add(series.merchantKey);
    const accountId = series.bankAccountId ?? busiestAccountId;
    if (!accountId) continue;
    const dates = scheduleSeries(
      {
        cadence: series.cadence,
        history: series.history,
        nextExpected: series.nextExpected,
      },
      today,
      horizonEnd
    );
    const list = eventsByAccount.get(accountId) ?? [];
    for (const date of dates) {
      list.push({
        label: series.displayName,
        direction: series.direction,
        amount: series.averageAmount,
        date,
      });
    }
    eventsByAccount.set(accountId, list);
  }

  // Variable daily spend per account over the recent window: DEBIT spend that
  // is neither a transfer between own accounts nor a scheduled series charge.
  const windowStart = addDays(today, -VARIABLE_SPEND_WINDOW_DAYS);
  const totalDebitByAccount = new Map<string, number>();
  const recurringDebitByAccount = new Map<string, number>();
  for (const t of transactions) {
    if (t.direction !== "DEBIT") continue;
    const date = t.valueDate.toISOString().slice(0, 10);
    if (date <= windowStart || date > today) continue;
    if (t.categorization?.category?.kind === "TRANSFER") continue;
    const amount = Math.abs(Number(t.amount.toString()));
    if (!Number.isFinite(amount)) continue;
    totalDebitByAccount.set(
      t.bankAccountId,
      (totalDebitByAccount.get(t.bankAccountId) ?? 0) + amount
    );
    const key = normalizeMerchantKey(t.description, t.remittanceInfo);
    if (confirmedDebitKeys.has(key)) {
      recurringDebitByAccount.set(
        t.bankAccountId,
        (recurringDebitByAccount.get(t.bankAccountId) ?? 0) + amount
      );
    }
  }

  const projections = accounts.map((account) => {
    const startingBalance = account.balances[0]
      ? Number(account.balances[0].balance.toString())
      : 0;
    const rate = dailyVariableSpend(
      totalDebitByAccount.get(account.id) ?? 0,
      recurringDebitByAccount.get(account.id) ?? 0,
      VARIABLE_SPEND_WINDOW_DAYS
    );
    return {
      rate,
      projection: projectAccountDaily(
        {
          accountId: account.id,
          accountName: account.name,
          startingBalance,
          dailyVariableSpend: rate,
          events: eventsByAccount.get(account.id) ?? [],
        },
        today,
        horizonDays
      ),
    };
  });

  const consolidated = consolidateDaily(projections.map((p) => p.projection));

  const accountNameById = new Map(accounts.map((a) => [a.id, a.name]));
  const upcomingEvents: UpcomingEvent[] = [...eventsByAccount.entries()]
    .flatMap(([accountId, events]) =>
      events.map((event) => ({
        ...event,
        accountName: accountNameById.get(accountId) ?? "",
        daysAway: Math.round(
          (Date.parse(event.date) - Date.parse(today)) / 86_400_000
        ),
      }))
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    today,
    horizonDays,
    threshold,
    accounts: projections.map(({ rate, projection }) => ({
      accountId: projection.accountId,
      accountName: projection.accountName,
      startingBalance: projection.startingBalance,
      minBalance: projection.minBalance,
      minDate: projection.minDate,
      dailyVariableSpend: rate,
      breach: firstBreach(projection.points, threshold),
      points: projection.points,
    })),
    consolidated,
    consolidatedBreach: firstBreach(consolidated, threshold),
    upcomingEvents,
  };
}
