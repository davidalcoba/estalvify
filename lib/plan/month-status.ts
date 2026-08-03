// Assembles "this month's money position" for a user: commitments (savings
// first), variable budget, what's been variably spent, the single
// available-to-spend number, and how the savings goal is actually going.
// Shared by the Dashboard, the Plan page and the notification cron so every
// surface shows the same numbers.
//
// Pure math lives in `lib/plan/commitments.ts` and `lib/plan/savings.ts`; this
// module is the one place that talks to Prisma for it.

import "server-only";

import { prisma } from "@/lib/prisma";
import {
  currentYearMonth,
  monthRange,
  buildMonthlySpendingWhere,
} from "@/lib/analytics/spending";
import { normalizeMerchantKey } from "@/lib/recurring/detect";
import type { PlanItemInput } from "./plan-item";
import {
  computeCommitments,
  splitVariableSpend,
  computeAvailable,
  type MonthCommitments,
  type AvailableToSpend,
  type VariableSpendSplit,
} from "./commitments";
import {
  monthTransferActivity,
  netSavingsChange,
  type MonthTransferActivity,
} from "./savings";

export interface SavingsStatus {
  accountId: string;
  accountName: string;
  /** Net balance change of the savings account this month (null = no snapshots). */
  netChange: number | null;
  activity: MonthTransferActivity;
}

export interface MonthStatus {
  year: number;
  month: number;
  dayOfMonth: number;
  daysInMonth: number;
  commitments: MonthCommitments;
  spend: VariableSpendSplit;
  available: AvailableToSpend;
  /** Null until the user picks a savings account in Settings. */
  savings: SavingsStatus | null;
  /** True when a savings goal is configured (amount or percent). */
  hasSavingsGoal: boolean;
  /** True when the Plan has at least one periodic item (the budget is real). */
  hasPlan: boolean;
}

export async function buildMonthStatus(
  userId: string,
  timezone: string,
  /** Sinking-fund monthly total, once those exist; commitments include it. */
  sinkingContribution = 0
): Promise<MonthStatus> {
  const { year, month } = currentYearMonth(timezone);
  const { start, end } = monthRange(year, month);

  const [user, planItems, spendRows, confirmedDebit] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        savingsGoalAmount: true,
        savingsGoalPercent: true,
        savingsAccountId: true,
      },
    }),
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
      select: { amount: true, description: true, remittanceInfo: true },
    }),
    prisma.recurringSeries.findMany({
      where: { userId, status: "CONFIRMED", direction: "DEBIT" },
      select: { merchantKey: true },
    }),
  ]);

  const planInputs: PlanItemInput[] = planItems.map((p) => ({
    direction: p.direction,
    categoryId: p.categoryId,
    amount: Number(p.amount.toString()),
    cadence: p.cadence,
    onDate: p.onDate ? p.onDate.toISOString().slice(0, 10) : null,
    endDate: p.endDate ? p.endDate.toISOString().slice(0, 10) : null,
  }));

  const savingsGoalAmount = user?.savingsGoalAmount
    ? Number(user.savingsGoalAmount.toString())
    : null;
  const savingsGoalPercent = user?.savingsGoalPercent
    ? Number(user.savingsGoalPercent.toString())
    : null;

  const commitments = computeCommitments({
    planItems: planInputs,
    ref: { year, month },
    savingsGoalAmount,
    savingsGoalPercent,
    sinkingContribution,
  });

  const spend = splitVariableSpend(
    spendRows.map((r) => ({
      amount: Number(r.amount.toString()),
      description: r.description,
      remittanceInfo: r.remittanceInfo,
    })),
    new Set(confirmedDebit.map((s) => s.merchantKey)),
    normalizeMerchantKey
  );

  const now = new Date();
  const dayOfMonth = Number(
    new Intl.DateTimeFormat("en-CA", { timeZone: timezone, day: "2-digit" }).format(now)
  );
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const available = computeAvailable({
    variableBudget: commitments.variableBudget,
    variableSpent: spend.variable,
    dayOfMonth,
    daysInMonth,
  });

  // Savings status, when an account is designated.
  let savings: SavingsStatus | null = null;
  if (user?.savingsAccountId) {
    const account = await prisma.bankAccount.findFirst({
      where: { id: user.savingsAccountId, userId },
      select: {
        id: true,
        name: true,
        balances: {
          orderBy: { date: "desc" },
          take: 1,
          select: { balance: true },
        },
      },
    });
    if (account) {
      const [startSnapshot, monthRows] = await Promise.all([
        // Balance entering the month: newest snapshot dated before month start.
        prisma.accountBalance.findFirst({
          where: { bankAccountId: account.id, date: { lt: start } },
          orderBy: { date: "desc" },
          select: { balance: true },
        }),
        prisma.transaction.findMany({
          where: {
            userId,
            bankAccountId: account.id,
            valueDate: { gte: start, lt: end },
          },
          select: {
            direction: true,
            amount: true,
            description: true,
            remittanceInfo: true,
            categorization: {
              select: { category: { select: { kind: true } } },
            },
          },
        }),
      ]);

      savings = {
        accountId: account.id,
        accountName: account.name,
        netChange: netSavingsChange(
          startSnapshot ? Number(startSnapshot.balance.toString()) : null,
          account.balances[0] ? Number(account.balances[0].balance.toString()) : null
        ),
        activity: monthTransferActivity(
          monthRows.map((r) => ({
            direction: r.direction,
            amount: Number(r.amount.toString()),
            description: r.description,
            remittanceInfo: r.remittanceInfo,
            categoryKind: r.categorization?.category?.kind ?? null,
          }))
        ),
      };
    }
  }

  return {
    year,
    month,
    dayOfMonth,
    daysInMonth,
    commitments,
    spend,
    available,
    savings,
    hasSavingsGoal: commitments.savingsGoal > 0,
    hasPlan: planInputs.some((p) => p.cadence !== "ONE_OFF"),
  };
}
