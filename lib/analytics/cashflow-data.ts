// Assembles the daily cash-flow projection under the v2 model: per-account
// balances, scheduled events from PENDING planned items (charges on their
// window's first day — conservative — and incomes on the window's last day),
// and a variable daily spend rate from the last 90 days of variable
// transactions. Shared by the "Upcoming charges" page and the notification
// cron so the curve the user sees and the alert that fires agree.

import "server-only";

import { prisma } from "@/lib/prisma";
import { normalizeDescriptor } from "@/lib/planned/matching";
import { resolveWindow, isoDate } from "@/lib/planned/schedule";
import {
  addDays,
  projectAccountDaily,
  consolidateDaily,
  firstBreach,
  dailyVariableSpend,
  type ScheduledEvent,
  type DailyPoint,
  type CashflowBreach,
} from "./cashflow";

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
  plannedItemId: string;
  status: "PENDING" | "MATCHED" | "MISSED";
}

export interface CashflowData {
  today: string;
  horizonDays: number;
  threshold: number;
  accounts: AccountCashflow[];
  consolidated: DailyPoint[];
  consolidatedBreach: CashflowBreach | null;
  upcomingEvents: UpcomingEvent[];
}

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
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));

  const windowStartDate = new Date();
  windowStartDate.setUTCDate(windowStartDate.getUTCDate() - VARIABLE_SPEND_WINDOW_DAYS);

  const [user, accounts, planned, matchedRows, series, recentTx] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { lowBalanceThreshold: true },
    }),
    prisma.bankAccount.findMany({
      where: { userId, isActive: true },
      select: {
        id: true,
        name: true,
        balances: { orderBy: { date: "desc" }, take: 1, select: { balance: true } },
      },
    }),
    prisma.plannedItem.findMany({
      // The current month and everything ahead; the horizon filter happens on
      // resolved dates below.
      where: {
        userId,
        status: "PENDING",
        OR: [{ year: { gt: year } }, { year, month: { gte: month } }],
      },
      select: {
        id: true,
        description: true,
        direction: true,
        amount: true,
        year: true,
        month: true,
        dueDay: true,
        windowFromDay: true,
        windowToDay: true,
        anchorMonthEnd: true,
        bankAccountId: true,
        status: true,
      },
    }),
    prisma.plannedItem.findMany({
      where: { userId, matchedTransactionId: { not: null } },
      select: { matchedTransactionId: true },
    }),
    prisma.recurringSeries.findMany({
      where: { userId, active: true },
      select: { merchantKey: true },
    }),
    prisma.transaction.findMany({
      where: { userId, direction: "DEBIT", valueDate: { gte: windowStartDate } },
      select: {
        id: true,
        amount: true,
        bankAccountId: true,
        description: true,
        remittanceInfo: true,
        categorization: { select: { category: { select: { kind: true } } } },
      },
    }),
  ]);

  const threshold = user ? Number(user.lowBalanceThreshold.toString()) : 0;

  // Busiest account fallback for items with no account configured.
  const txCountByAccount = new Map<string, number>();
  for (const t of recentTx) {
    txCountByAccount.set(t.bankAccountId, (txCountByAccount.get(t.bankAccountId) ?? 0) + 1);
  }
  const busiestAccountId =
    [...txCountByAccount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ??
    accounts[0]?.id ??
    null;

  // ── Events from planned items ────────────────────────────────────────────
  const eventsByAccount = new Map<string, (ScheduledEvent & { plannedItemId: string; status: "PENDING" | "MATCHED" | "MISSED" })[]>();
  for (const item of planned) {
    const ym = { year: item.year, month: item.month };
    const window =
      item.dueDay != null && !item.anchorMonthEnd
        ? { fromDay: item.dueDay, toDay: item.dueDay }
        : resolveWindow(item, ym);
    // Charges on the window's FIRST day, income on its LAST: both choices are
    // the conservative side of "will the money be there".
    const date = isoDate(ym, item.direction === "DEBIT" ? window.fromDay : window.toDay);
    if (date <= today || date > horizonEnd) continue;
    const accountId = item.bankAccountId ?? busiestAccountId;
    if (!accountId) continue;
    const list = eventsByAccount.get(accountId) ?? [];
    list.push({
      label: item.description,
      direction: item.direction,
      amount: Number(item.amount.toString()),
      date,
      plannedItemId: item.id,
      status: item.status,
    });
    eventsByAccount.set(accountId, list);
  }

  // ── Variable daily spend per account (exclusion-derived, like everywhere) ─
  const matchedIds = new Set(matchedRows.map((r) => r.matchedTransactionId));
  const matchers = series
    .map((s) => normalizeDescriptor(s.merchantKey))
    .filter((m) => m.length >= 3);
  const totalDebitByAccount = new Map<string, number>();
  const plannedDebitByAccount = new Map<string, number>();
  for (const t of recentTx) {
    if (t.categorization?.category?.kind === "TRANSFER") continue;
    const amount = Math.abs(Number(t.amount.toString()));
    totalDebitByAccount.set(
      t.bankAccountId,
      (totalDebitByAccount.get(t.bankAccountId) ?? 0) + amount
    );
    const descriptor = normalizeDescriptor(`${t.description ?? ""} ${t.remittanceInfo ?? ""}`);
    if (matchedIds.has(t.id) || matchers.some((m) => descriptor.includes(m))) {
      plannedDebitByAccount.set(
        t.bankAccountId,
        (plannedDebitByAccount.get(t.bankAccountId) ?? 0) + amount
      );
    }
  }

  const projections = accounts.map((account) => {
    const startingBalance = account.balances[0]
      ? Number(account.balances[0].balance.toString())
      : 0;
    const rate = dailyVariableSpend(
      totalDebitByAccount.get(account.id) ?? 0,
      plannedDebitByAccount.get(account.id) ?? 0,
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
        daysAway: Math.round((Date.parse(event.date) - Date.parse(today)) / 86_400_000),
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
