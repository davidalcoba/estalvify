// Assembles the month's money position under the v2 model: the cascade
// (base income − planned − rollover quotas − savings goal), the weekly
// available with its operations counter, rollover funds with derived balances,
// and the savings execution status. Shared by the Dashboard, the monthly
// control page and the notification cron so every surface shows one truth.
//
// Pure math: lib/budget/cascade.ts + lib/budget/weekly.ts. Matching state is
// maintained by lib/planned/engine.ts before this reads it.

import "server-only";

import { prisma } from "@/lib/prisma";
import { currentYearMonth, monthRange } from "@/lib/analytics/spending";
import { normalizeDescriptor } from "@/lib/planned/matching";
import {
  computeCascade,
  extraordinaryIncome,
  rolloverBalance,
  type MonthCascade,
} from "./cascade";
import {
  computeWeeklyAvailable,
  weekOperations,
  weeklyOpsMedian,
  weekComposition,
  type WeeklyAvailable,
  type VariableTx,
} from "./weekly";
import {
  monthTransferActivity,
  netSavingsChange,
  type MonthTransferActivity,
} from "@/lib/plan/savings";

const OPS_LOOKBACK_DAYS = 98; // 14 weeks: current + 12 complete + margin

export interface SavingsStatus {
  accountId: string;
  accountName: string;
  netChange: number | null;
  activity: MonthTransferActivity;
}

export interface RolloverFundStatus {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  assigned: number; // this month's quota
  balance: number; // accumulated across months (derived)
}

export interface WeekCompositionRow {
  categoryId: string | null;
  categoryName: string;
  categoryColor: string | null;
  spent: number;
  count: number;
}

export interface MonthStatus {
  year: number;
  month: number;
  today: string; // YYYY-MM-DD, user timezone
  /** Base income is configuration; false until the user sets it in Settings. */
  configured: boolean;
  cascade: MonthCascade;
  weekly: WeeklyAvailable;
  opsThisWeek: number;
  opsMedian: number;
  spentThisWeek: number;
  composition: WeekCompositionRow[];
  variableSpentMonth: number;
  extraordinaryIncome: number;
  funds: RolloverFundStatus[];
  savings: SavingsStatus | null;
  hasSavingsGoal: boolean;
}

function todayInTimezone(timezone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * "The month arrives already assigned": copy last month's rollover quotas into
 * the current month if it has none yet. Deleting a fund's current-month row
 * stops the propagation from the next month on — the copy only ever looks one
 * month back.
 */
export async function ensureRolloverPropagation(
  userId: string,
  year: number,
  month: number
): Promise<void> {
  const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const [prevBudget, currentBudget] = await Promise.all([
    prisma.budget.findUnique({
      where: { userId_year_month: { userId, year: prev.year, month: prev.month } },
      select: { budgetItems: { where: { rollover: true }, select: { categoryId: true, plannedAmount: true } } },
    }),
    prisma.budget.findUnique({
      where: { userId_year_month: { userId, year, month } },
      select: { id: true, budgetItems: { select: { categoryId: true } } },
    }),
  ]);
  const carry = prevBudget?.budgetItems ?? [];
  if (carry.length === 0) return;

  const budgetId =
    currentBudget?.id ??
    (
      await prisma.budget.upsert({
        where: { userId_year_month: { userId, year, month } },
        create: { userId, year, month },
        update: {},
        select: { id: true },
      })
    ).id;
  const have = new Set((currentBudget?.budgetItems ?? []).map((i) => i.categoryId));
  const creates = carry.filter((c) => !have.has(c.categoryId));
  if (creates.length > 0) {
    await prisma.budgetItem.createMany({
      data: creates.map((c) => ({
        budgetId,
        categoryId: c.categoryId,
        plannedAmount: c.plannedAmount,
        rollover: true,
      })),
      skipDuplicates: true,
    });
  }
}

export async function buildMonthStatus(
  userId: string,
  timezone: string
): Promise<MonthStatus> {
  const { year, month } = currentYearMonth(timezone);
  await ensureRolloverPropagation(userId, year, month);
  const today = todayInTimezone(timezone);
  const { start, end } = monthRange(year, month);
  const opsStart = new Date(start);
  opsStart.setUTCDate(opsStart.getUTCDate() - OPS_LOOKBACK_DAYS);

  const [user, plannedMonth, matchedIdsRows, series, txWindow, budgets, categories] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          baseMonthlyIncome: true,
          savingsGoalAmount: true,
          savingsGoalPercent: true,
          savingsAccountId: true,
        },
      }),
      prisma.plannedItem.findMany({
        where: { userId, year, month },
        select: { direction: true, amount: true, matchedAmount: true, status: true },
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
        // DEBIT expense rows for the ops window; the variable set is derived
        // by exclusion (matched planned items + series matchers), so a rent
        // charge never shows up as an "operation" (acceptance #8).
        where: {
          userId,
          direction: "DEBIT",
          valueDate: { gte: opsStart },
          categorization: {
            is: { status: "APPROVED", category: { is: { kind: "EXPENSE" } } },
          },
        },
        select: {
          id: true,
          valueDate: true,
          amount: true,
          description: true,
          remittanceInfo: true,
          categorization: { select: { categoryId: true } },
        },
      }),
      prisma.budget.findMany({
        where: { userId },
        orderBy: [{ year: "asc" }, { month: "asc" }],
        select: {
          year: true,
          month: true,
          budgetItems: {
            select: { categoryId: true, plannedAmount: true, rollover: true },
          },
        },
      }),
      prisma.category.findMany({
        where: { OR: [{ userId }, { userId: null }] },
        select: { id: true, name: true, color: true },
      }),
    ]);

  const baseIncome = user?.baseMonthlyIncome
    ? Number(user.baseMonthlyIncome.toString())
    : 0;
  const savingsGoalAmount = user?.savingsGoalAmount
    ? Number(user.savingsGoalAmount.toString())
    : null;
  const savingsGoalPercent = user?.savingsGoalPercent
    ? Number(user.savingsGoalPercent.toString())
    : null;
  const savingsGoal =
    savingsGoalAmount ??
    (savingsGoalPercent ? Math.round(baseIncome * savingsGoalPercent) / 100 : 0);

  // ── Variable set (derived by exclusion) ─────────────────────────────────
  const matchedIds = new Set(matchedIdsRows.map((r) => r.matchedTransactionId));
  const matchers = series
    .map((s) => normalizeDescriptor(s.merchantKey))
    .filter((m) => m.length >= 3);
  const variableTx: VariableTx[] = [];
  let variableSpentMonth = 0;
  for (const tx of txWindow) {
    if (matchedIds.has(tx.id)) continue;
    const descriptor = normalizeDescriptor(
      `${tx.description ?? ""} ${tx.remittanceInfo ?? ""}`
    );
    if (matchers.some((m) => descriptor.includes(m))) continue;
    const amount = Math.abs(Number(tx.amount.toString()));
    const date = tx.valueDate.toISOString().slice(0, 10);
    variableTx.push({
      date,
      amount,
      categoryId: tx.categorization?.categoryId ?? null,
    });
    if (tx.valueDate >= start && tx.valueDate < end) variableSpentMonth += amount;
  }
  variableSpentMonth = Math.round(variableSpentMonth * 100) / 100;

  // ── Rollover funds: this month's quota + derived balance ────────────────
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  // Fund identity is the category. Collect every rollover row per category,
  // then balance = Σ (assigned − spent-in-category-that-month).
  const fundRows = new Map<string, { year: number; month: number; assigned: number }[]>();
  const currentFundIds = new Set<string>();
  for (const b of budgets) {
    for (const item of b.budgetItems) {
      if (!item.rollover) continue;
      if (b.year > year || (b.year === year && b.month > month)) continue;
      if (b.year === year && b.month === month) currentFundIds.add(item.categoryId);
      const list = fundRows.get(item.categoryId) ?? [];
      list.push({
        year: b.year,
        month: b.month,
        assigned: Number(item.plannedAmount.toString()),
      });
      fundRows.set(item.categoryId, list);
    }
  }
  // A fund is "live" when it has a row THIS month (deleting that row retires
  // it); balances still derive from the full history.
  const fundCategoryIds = [...currentFundIds];
  const fundSpend = new Map<string, number>(); // `${cat}:${y}-${m}` → spent
  if (fundCategoryIds.length > 0) {
    const rows = await prisma.transaction.findMany({
      where: {
        userId,
        direction: "DEBIT",
        categorization: {
          is: { status: "APPROVED", categoryId: { in: fundCategoryIds } },
        },
      },
      select: {
        amount: true,
        valueDate: true,
        categorization: { select: { categoryId: true } },
      },
    });
    for (const row of rows) {
      const key = `${row.categorization!.categoryId}:${row.valueDate.getUTCFullYear()}-${row.valueDate.getUTCMonth() + 1}`;
      fundSpend.set(
        key,
        (fundSpend.get(key) ?? 0) + Math.abs(Number(row.amount.toString()))
      );
    }
  }
  const funds: RolloverFundStatus[] = fundCategoryIds.map((categoryId) => {
    const rows = fundRows.get(categoryId)!;
    const currentRow = rows.find((r) => r.year === year && r.month === month);
    const balance = rolloverBalance(
      rows.map((r) => ({
        assigned: r.assigned,
        spent: fundSpend.get(`${categoryId}:${r.year}-${r.month}`) ?? 0,
      }))
    );
    const cat = categoryById.get(categoryId);
    return {
      categoryId,
      categoryName: cat?.name ?? "?",
      categoryColor: cat?.color ?? "#6366f1",
      assigned: currentRow?.assigned ?? 0,
      balance,
    };
  });
  const rolloverQuotas = funds.reduce((sum, f) => sum + f.assigned, 0);

  // ── Cascade + weekly ─────────────────────────────────────────────────────
  const cascade = computeCascade({
    baseIncome,
    plannedItems: plannedMonth.map((p) => ({
      direction: p.direction,
      amount: Number(p.amount.toString()),
      matchedAmount: p.matchedAmount ? Number(p.matchedAmount.toString()) : null,
      status: p.status,
    })),
    rolloverQuotas,
    savingsGoal,
  });

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const weekly = computeWeeklyAvailable({
    variableBudget: cascade.variableBudget,
    variableSpentMonth,
    today,
    daysInMonth,
  });
  const ops = weekOperations(variableTx, today);
  const composition = weekComposition(variableTx, today).map((row) => {
    const cat = row.categoryId ? categoryById.get(row.categoryId) : null;
    return {
      ...row,
      categoryName: cat?.name ?? "Uncategorized",
      categoryColor: cat?.color ?? null,
    };
  });

  // ── Extraordinary income (by difference, no heuristics) ─────────────────
  const incomeAgg = await prisma.transaction.aggregate({
    where: {
      userId,
      direction: "CREDIT",
      valueDate: { gte: start, lt: end },
      categorization: {
        is: { status: "APPROVED", category: { is: { kind: "INCOME" } } },
      },
    },
    _sum: { amount: true },
  });
  const actualIncome = incomeAgg._sum.amount
    ? Math.abs(Number(incomeAgg._sum.amount.toString()))
    : 0;

  // ── Savings execution (unchanged from v1 — it was kept on purpose) ──────
  let savings: SavingsStatus | null = null;
  if (user?.savingsAccountId) {
    const account = await prisma.bankAccount.findFirst({
      where: { id: user.savingsAccountId, userId },
      select: {
        id: true,
        name: true,
        balances: { orderBy: { date: "desc" }, take: 1, select: { balance: true } },
      },
    });
    if (account) {
      const [startSnapshot, monthRows] = await Promise.all([
        prisma.accountBalance.findFirst({
          where: { bankAccountId: account.id, date: { lt: start } },
          orderBy: { date: "desc" },
          select: { balance: true },
        }),
        prisma.transaction.findMany({
          where: { userId, bankAccountId: account.id, valueDate: { gte: start, lt: end } },
          select: {
            direction: true,
            amount: true,
            description: true,
            remittanceInfo: true,
            categorization: { select: { category: { select: { kind: true } } } },
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
    today,
    configured: baseIncome > 0,
    cascade,
    weekly,
    opsThisWeek: ops.count,
    spentThisWeek: ops.spent,
    opsMedian: weeklyOpsMedian(variableTx, today),
    composition,
    variableSpentMonth,
    extraordinaryIncome: extraordinaryIncome(actualIncome, baseIncome),
    funds,
    savings,
    hasSavingsGoal: savingsGoal > 0,
  };
}
