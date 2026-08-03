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
  aggregateSpendingByCategory,
} from "@/lib/analytics/spending";
import { plannedMonthlyByCategory, type PlanItemInput } from "./plan-item";
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
import { accruedAmount, isFunded, totalMonthlyContribution } from "./sinking-funds";

export interface SavingsStatus {
  accountId: string;
  accountName: string;
  /** Net balance change of the savings account this month (null = no snapshots). */
  netChange: number | null;
  activity: MonthTransferActivity;
}

export interface SinkingFundStatus {
  id: string;
  name: string;
  targetAmount: number;
  targetDate: string | null; // YYYY-MM-DD
  monthlyContribution: number;
  initialAmount: number;
  accrued: number;
  funded: boolean;
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
  /** Active sinking funds with their computed accruals. */
  funds: SinkingFundStatus[];
}

export async function buildMonthStatus(
  userId: string,
  timezone: string
): Promise<MonthStatus> {
  const { year, month } = currentYearMonth(timezone);
  const { start, end } = monthRange(year, month);

  const [user, planItems, spendRows, fundRows] = await Promise.all([
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
      select: {
        amount: true,
        categorization: { select: { categoryId: true } },
        splits: { select: { amount: true, categoryId: true } },
      },
    }),
    prisma.sinkingFund.findMany({
      where: { userId, active: true },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        targetAmount: true,
        targetDate: true,
        monthlyContribution: true,
        startDate: true,
        initialAmount: true,
      },
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

  const fundInputs = fundRows.map((f) => ({
    id: f.id,
    name: f.name,
    targetAmount: Number(f.targetAmount.toString()),
    targetDate: f.targetDate ? f.targetDate.toISOString().slice(0, 10) : null,
    monthlyContribution: Number(f.monthlyContribution.toString()),
    startDate: f.startDate.toISOString().slice(0, 10),
    initialAmount: Number(f.initialAmount.toString()),
  }));
  const sinkingContribution = totalMonthlyContribution(fundInputs, {
    year,
    month,
  });

  const commitments = computeCommitments({
    planItems: planInputs,
    ref: { year, month },
    savingsGoalAmount,
    savingsGoalPercent,
    sinkingContribution,
  });

  const spend = splitVariableSpend(
    aggregateSpendingByCategory(spendRows),
    plannedMonthlyByCategory(planInputs, { year, month })
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
    funds: fundInputs.map((f) => ({
      id: f.id,
      name: f.name,
      targetAmount: f.targetAmount,
      targetDate: f.targetDate,
      monthlyContribution: f.monthlyContribution,
      initialAmount: f.initialAmount,
      accrued: accruedAmount(f, { year, month }),
      funded: isFunded(f, { year, month }),
    })),
  };
}
