// Assembles the month's money position under the v3 model: the cascade whose
// bottom line is the EXPECTED RESULT (the goal), per-category objectives with
// a pace reference, the weekly available with its operations counter, and the
// reconciliation block — real result under accrual, performance vs expected,
// the consolidated balance change (which IS the month's savings) and the
// flows-vs-balance discrepancy check. Accounts carry no semantics anywhere
// here: planning is consolidated.
//
// Pure math: lib/budget/cascade.ts + lib/budget/weekly.ts. Matching state is
// maintained by lib/planned/engine.ts before this reads it.

import "server-only";

import { prisma } from "@/lib/prisma";
import { currentYearMonth, monthRange } from "@/lib/analytics/spending";
import { normalizeDescriptor, isProvisionalMonth } from "@/lib/planned/matching";
import { nearestInSet, rootOf, type ParentMap } from "@/lib/categories/hierarchy";
import {
  computeCascade,
  computeActualResult,
  performance,
  reconciliationGap,
  rolloverBalance,
  monthsOfCushion,
  type MonthCascade,
  type ActualResult,
} from "./cascade";
import { computeControl, type ControlRow } from "./control";
import {
  computeWeeklyAvailable,
  weekOperations,
  weeklyOpsMedian,
  isoWeekStart,
  weekComposition,
  type WeeklyAvailable,
  type VariableTx,
} from "./weekly";

const OPS_LOOKBACK_DAYS = 98; // 14 weeks: current + 12 complete + margin
const CUSHION_BASELINE_MONTHS = 6;

export interface ObjectiveRecurring {
  description: string;
  amount: number;
  status: "PENDING" | "MATCHED" | "MISSED";
}

export interface ObjectiveTransaction {
  date: string; // YYYY-MM-DD
  description: string;
  amount: number;
}

/**
 * A monthly-control category objective. At minimum it holds the recurring
 * charges of its category (`base`, from the month's planned items) plus
 * whatever is added manually (`extra`, the budget item); `assigned` is the
 * sum. `consumed` accumulates ALL the month's expense transactions of the
 * category subtree — a transaction rolls up to the nearest objective that
 * owns its category.
 */
export interface CategoryObjective {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  /** Σ recurring charges of the category expected this month. */
  base: number;
  /** The manual assignment on top (the budget item; 0 when none). */
  extra: number;
  /** base + extra. */
  assigned: number;
  consumed: number;
  /**
   * Rollover objectives have INVERTED polarity: the % is accumulation
   * progress (more is better), not consumption. Same widget, opposite meaning
   * — the UI must distinguish them.
   */
  rollover: boolean;
  /** Accumulated balance across months (rollover only). */
  balance: number | null;
  /** The recurring charges composing the base. */
  recurrings: ObjectiveRecurring[];
  /** The month's transactions accumulated under this objective, newest first. */
  transactions: ObjectiveTransaction[];
}

/** Expected income of the month, grouped by category — the Income side of
 *  the objectives list. Received books per accrual (matched amounts). */
export interface IncomeObjective {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  expected: number;
  received: number;
  recurrings: ObjectiveRecurring[];
}

export interface Reconciliation extends ActualResult {
  expectedResult: number;
  performance: number;
  /** The month's consolidated balance change — the REAL savings, derived. */
  consolidatedDelta: number | null;
  /** consolidatedDelta − actualResult: uncaptured flow when non-zero. */
  discrepancy: number | null;
  consolidatedBalance: number | null;
  monthsOfCushion: number | null;
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
  /** True while last month's charges can still slide in — numbers may move. */
  provisional: boolean;
  /** 0–1, how much of the month has elapsed (the pace reference). */
  monthElapsed: number;
  /** False until at least one budget assignment exists. */
  configured: boolean;
  cascade: MonthCascade;
  weekly: WeeklyAvailable;
  opsThisWeek: number;
  opsMedian: number;
  spentThisWeek: number;
  composition: WeekCompositionRow[];
  variableSpentMonth: number;
  /** Category control for the DAILY screen: discretionary objectives only. */
  control: ControlRow[];
  /**
   * Category control for the MONTH screen: every non-rollover objective,
   * fixed ones included, each carrying `fixedTotal` — the committed slice of
   * its budget. Superset of `control`, same ordering.
   */
  chargeControl: ControlRow[];
  objectives: CategoryObjective[];
  incomeObjectives: IncomeObjective[];
  reconciliation: Reconciliation;
}

function todayInTimezone(timezone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * "The month arrives already assigned": copy last month's budget items
 * (rollover funds AND variable assignments) into the current month if it has
 * none yet. Deleting a current-month row stops the propagation from the next
 * month on — the copy only ever looks one month back.
 */
export async function ensureBudgetPropagation(
  userId: string,
  year: number,
  month: number
): Promise<void> {
  const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const [prevBudget, currentBudget] = await Promise.all([
    prisma.budget.findUnique({
      where: { userId_year_month: { userId, year: prev.year, month: prev.month } },
      select: {
        budgetItems: {
          select: { categoryId: true, plannedAmount: true, rollover: true },
        },
      },
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
        rollover: c.rollover,
      })),
      skipDuplicates: true,
    });
  }
}

/** Months between two (year, month) pairs: positive when b is after a. */
function monthDiff(a: { year: number; month: number }, b: { year: number; month: number }): number {
  return (b.year - a.year) * 12 + (b.month - a.month);
}

export async function buildMonthStatus(
  userId: string,
  timezone: string,
  /** Month to view; defaults to the current one. Navigation never mutates the past. */
  target?: { year: number; month: number }
): Promise<MonthStatus> {
  const current = currentYearMonth(timezone);
  const { year, month } = target ?? current;
  // Propagate assignments from the current month forward to the viewed month
  // (chain of one-month-back copies), never into the past — materializing
  // rows in a closed month would falsify its history. Bounded so a deep link
  // can't mass-create budgets.
  const ahead = monthDiff(current, { year, month });
  for (let i = 0; i <= Math.min(Math.max(ahead, 0), 12); i++) {
    const m0 = current.month - 1 + i;
    await ensureBudgetPropagation(
      userId,
      current.year + Math.floor(m0 / 12),
      (m0 % 12) + 1
    );
  }
  const today = todayInTimezone(timezone);
  const { start, end } = monthRange(year, month);
  const isCurrentView = ahead === 0;
  // The 14-week ops lookback only feeds the weekly counters, which are a
  // current-month concept — when navigating to another month the window
  // narrows to that month, which is most of what makes navigation fast.
  const opsStart = new Date(start);
  opsStart.setUTCDate(opsStart.getUTCDate() - OPS_LOOKBACK_DAYS);
  const windowStart = isCurrentView ? opsStart : start;

  // A matched transaction can only land within the tolerance of its item's
  // month, so the exclusion set is bounded to items whose (year, month) falls
  // inside the tx window ± one month — not every matched item ever.
  const matchedMonths: { year: number; month: number }[] = [];
  {
    const cursor = new Date(Date.UTC(windowStart.getUTCFullYear(), windowStart.getUTCMonth() - 1, 1));
    const stop = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 1));
    while (cursor <= stop) {
      matchedMonths.push({ year: cursor.getUTCFullYear(), month: cursor.getUTCMonth() + 1 });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  }

  const [plannedMonth, matchedIdsRows, series, txWindow, monthFlows, budgets, categories, accounts] =
    await Promise.all([
      prisma.plannedItem.findMany({
        where: { userId, year, month },
        select: {
          direction: true,
          amount: true,
          matchedAmount: true,
          status: true,
          categoryId: true,
          description: true,
        },
      }),
      prisma.plannedItem.findMany({
        where: { userId, matchedTransactionId: { not: null }, OR: matchedMonths },
        select: { matchedTransactionId: true },
      }),
      prisma.recurringSeries.findMany({
        where: { userId, active: true },
        select: { merchantKey: true },
      }),
      prisma.transaction.findMany({
        // DEBIT expense rows for the ops window; the variable set is derived
        // by exclusion (matched planned items + series matchers), so a rent
        // charge never shows up as an "operation" (plan test #10).
        where: {
          userId,
          direction: "DEBIT",
          valueDate: { gte: windowStart, lt: end },
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
      prisma.transaction.findMany({
        // Both directions for the month's REAL result — transfers between own
        // accounts excluded (they are internal noise, plan test #11).
        where: {
          userId,
          valueDate: { gte: start, lt: end },
          NOT: {
            categorization: {
              is: { category: { is: { kind: "TRANSFER" } } },
            },
          },
        },
        select: { id: true, direction: true, amount: true },
      }),
      prisma.budget.findMany({
        where: { userId },
        orderBy: [{ year: "asc" }, { month: "asc" }],
        select: {
          year: true,
          month: true,
          savingsTarget: true,
          budgetItems: {
            select: { categoryId: true, plannedAmount: true, rollover: true },
          },
        },
      }),
      prisma.category.findMany({
        where: { OR: [{ userId }, { userId: null }] },
        select: { id: true, name: true, color: true, parentId: true },
      }),
      prisma.bankAccount.findMany({
        where: { userId, isActive: true },
        select: { id: true },
      }),
    ]);

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
  variableSpentMonth = round(variableSpentMonth);

  // ── Budget items: current month's assignments + rollover balances ───────
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const currentItems: { categoryId: string; assigned: number; rollover: boolean }[] = [];
  const rolloverHistory = new Map<string, { year: number; month: number; assigned: number }[]>();
  let savingsTarget = 0;
  for (const b of budgets) {
    if (b.year === year && b.month === month) {
      savingsTarget = Number(b.savingsTarget.toString());
    }
    for (const item of b.budgetItems) {
      const inPast = b.year < year || (b.year === year && b.month <= month);
      if (b.year === year && b.month === month) {
        currentItems.push({
          categoryId: item.categoryId,
          assigned: Number(item.plannedAmount.toString()),
          rollover: item.rollover,
        });
      }
      if (item.rollover && inPast) {
        const list = rolloverHistory.get(item.categoryId) ?? [];
        list.push({
          year: b.year,
          month: b.month,
          assigned: Number(item.plannedAmount.toString()),
        });
        rolloverHistory.set(item.categoryId, list);
      }
    }
  }
  // v4: the Σ of non-rollover lines is the per-category SPLIT; the month's
  // variable budget itself is the cascade's residue (income − fixed − quotas
  // − savingsTarget). A mismatch surfaces as cascade.assignmentGap.
  const assignedVariable = currentItems
    .filter((i) => !i.rollover)
    .reduce((sum, i) => sum + i.assigned, 0);
  const rolloverQuotas = currentItems
    .filter((i) => i.rollover)
    .reduce((sum, i) => sum + i.assigned, 0);

  // Second query wave, all concurrent: fund spend (bounded to the funds'
  // first assigned month — earlier spend can't touch a balance), the
  // month-boundary balance snapshots, and the cushion baseline.
  const fundCategoryIds = currentItems.filter((i) => i.rollover).map((i) => i.categoryId);
  let fundEpoch: Date | null = null;
  for (const list of rolloverHistory.values()) {
    for (const r of list) {
      const d = new Date(Date.UTC(r.year, r.month - 1, 1));
      if (!fundEpoch || d < fundEpoch) fundEpoch = d;
    }
  }
  const baselineStart = new Date(Date.UTC(year, month - 1 - CUSHION_BASELINE_MONTHS, 1));
  const [fundRows, startSnapshots, endSnapshots, baselineAgg] = await Promise.all([
    fundCategoryIds.length > 0 && fundEpoch
      ? prisma.transaction.findMany({
          where: {
            userId,
            direction: "DEBIT",
            valueDate: { gte: fundEpoch },
            categorization: {
              is: { status: "APPROVED", categoryId: { in: fundCategoryIds } },
            },
          },
          select: {
            amount: true,
            valueDate: true,
            categorization: { select: { categoryId: true } },
          },
        })
      : Promise.resolve([]),
    Promise.all(
      accounts.map((a) =>
        prisma.accountBalance.findFirst({
          where: { bankAccountId: a.id, date: { lt: start } },
          orderBy: { date: "desc" },
          select: { balance: true },
        })
      )
    ),
    Promise.all(
      accounts.map((a) =>
        prisma.accountBalance.findFirst({
          where: { bankAccountId: a.id, date: { lt: end } },
          orderBy: { date: "desc" },
          select: { balance: true },
        })
      )
    ),
    prisma.transaction.aggregate({
      // Average monthly spend over the trailing full months, for the cushion.
      where: {
        userId,
        direction: "DEBIT",
        valueDate: { gte: baselineStart, lt: start },
        NOT: { categorization: { is: { category: { is: { kind: "TRANSFER" } } } } },
      },
      _sum: { amount: true },
    }),
  ]);
  const fundSpend = new Map<string, number>();
  for (const row of fundRows) {
    const key = `${row.categorization!.categoryId}:${row.valueDate.getUTCFullYear()}-${row.valueDate.getUTCMonth() + 1}`;
    fundSpend.set(key, (fundSpend.get(key) ?? 0) + Math.abs(Number(row.amount.toString())));
  }

  // ── Objectives: recurring base + manual extra ───────────────────────────
  // A category objective holds AT MINIMUM the recurring charges of its
  // category, plus the manual assignment. Planned charges whose category has
  // no budget item surface as a base-only objective at their top-level
  // category, so every recurring is visible somewhere.
  const parentOf: ParentMap = new Map(categories.map((c) => [c.id, c.parentId]));
  const objectiveSet = new Set(currentItems.map((i) => i.categoryId));
  const plannedDebits = plannedMonth.filter(
    (p) => p.direction === "DEBIT" && p.categoryId
  );
  for (const p of plannedDebits) {
    if (nearestInSet(p.categoryId!, objectiveSet, parentOf)) continue;
    objectiveSet.add(rootOf(p.categoryId!, parentOf));
  }
  const baseByObjective = new Map<string, number>();
  // Of that base, what has already been charged — the control projection needs
  // it to tell the committed part from the discretionary one.
  const matchedBaseByObjective = new Map<string, number>();
  const recurringsByObjective = new Map<string, ObjectiveRecurring[]>();
  for (const p of plannedDebits) {
    const target = nearestInSet(p.categoryId!, objectiveSet, parentOf);
    if (!target) continue;
    const amount = Number(p.amount.toString());
    baseByObjective.set(target, (baseByObjective.get(target) ?? 0) + amount);
    if (p.status === "MATCHED" && p.matchedAmount != null) {
      matchedBaseByObjective.set(
        target,
        (matchedBaseByObjective.get(target) ?? 0) + Number(p.matchedAmount.toString())
      );
    }
    const list = recurringsByObjective.get(target) ?? [];
    list.push({ description: p.description, amount: round(amount), status: p.status });
    recurringsByObjective.set(target, list);
  }

  // ALL of the month's expense transactions accumulate under the nearest
  // objective owning their category (by date — no accrual in the objectives,
  // plan §4.5). This includes the recurring charges themselves: they consume
  // against base + extra.
  const monthStartStr = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthEndStr = end.toISOString().slice(0, 10);
  const consumedByObjective = new Map<string, number>();
  const txsByObjective = new Map<string, ObjectiveTransaction[]>();
  for (const tx of txWindow) {
    const date = tx.valueDate.toISOString().slice(0, 10);
    if (date < monthStartStr || date >= monthEndStr) continue;
    const catId = tx.categorization?.categoryId;
    if (!catId) continue;
    const target = nearestInSet(catId, objectiveSet, parentOf);
    if (!target) continue;
    const amount = Math.abs(Number(tx.amount.toString()));
    consumedByObjective.set(target, (consumedByObjective.get(target) ?? 0) + amount);
    const list = txsByObjective.get(target) ?? [];
    list.push({
      date,
      description: (tx.description ?? tx.remittanceInfo ?? "").trim().slice(0, 80),
      amount: round(amount),
    });
    txsByObjective.set(target, list);
  }

  // Income side: expected income of the month grouped by root category,
  // received per accrual (matched amounts book in their item's month).
  const incomeMap = new Map<
    string,
    { expected: number; received: number; recurrings: ObjectiveRecurring[] }
  >();
  for (const p of plannedMonth) {
    if (p.direction !== "CREDIT" || !p.categoryId) continue;
    const target = rootOf(p.categoryId, parentOf);
    const entry = incomeMap.get(target) ?? { expected: 0, received: 0, recurrings: [] };
    const amount = Number(p.amount.toString());
    entry.expected += amount;
    if (p.status === "MATCHED" && p.matchedAmount != null) {
      entry.received += Number(p.matchedAmount.toString());
    }
    entry.recurrings.push({ description: p.description, amount: round(amount), status: p.status });
    incomeMap.set(target, entry);
  }
  const incomeObjectives: IncomeObjective[] = [...incomeMap.entries()]
    .map(([categoryId, e]) => {
      const cat = categoryById.get(categoryId);
      return {
        categoryId,
        categoryName: cat?.name ?? "?",
        categoryColor: cat?.color ?? "#14b8a6",
        expected: round(e.expected),
        received: round(e.received),
        recurrings: e.recurrings.sort((a, b) => b.amount - a.amount),
      };
    })
    .sort((a, b) => b.expected - a.expected);

  const itemByCategory = new Map(currentItems.map((i) => [i.categoryId, i]));
  const objectives: CategoryObjective[] = [...objectiveSet]
    .map((categoryId) => {
      const item = itemByCategory.get(categoryId);
      const cat = categoryById.get(categoryId);
      const base = round(baseByObjective.get(categoryId) ?? 0);
      const extra = round(item?.assigned ?? 0);
      const rollover = item?.rollover ?? false;
      const balance = rollover
        ? rolloverBalance(
            (rolloverHistory.get(categoryId) ?? []).map((r) => ({
              assigned: r.assigned,
              spent: fundSpend.get(`${categoryId}:${r.year}-${r.month}`) ?? 0,
            }))
          )
        : null;
      return {
        categoryId,
        categoryName: cat?.name ?? "?",
        categoryColor: cat?.color ?? "#6366f1",
        base,
        extra,
        assigned: round(base + extra),
        consumed: round(consumedByObjective.get(categoryId) ?? 0),
        rollover,
        balance,
        recurrings: (recurringsByObjective.get(categoryId) ?? []).sort(
          (a, b) => b.amount - a.amount
        ),
        transactions: (txsByObjective.get(categoryId) ?? []).sort((a, b) =>
          a.date < b.date ? 1 : -1
        ),
      };
    })
    .sort((a, b) => Number(a.rollover) - Number(b.rollover) || b.assigned - a.assigned);

  // ── Cascade (always EXPECTED amounts — the plan is the plan) ────────────
  const cascade = computeCascade({
    plannedItems: plannedMonth.map((p) => ({
      direction: p.direction,
      amount: Number(p.amount.toString()),
    })),
    rolloverQuotas,
    savingsTarget,
    assignedVariable,
  });

  // ── Weekly ───────────────────────────────────────────────────────────────
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

  // ── Reconciliation: real result under accrual + balance-change check ────
  let matchedCredit = 0;
  let matchedDebit = 0;
  for (const p of plannedMonth) {
    if (p.status !== "MATCHED" || p.matchedAmount == null) continue;
    const amount = Number(p.matchedAmount.toString());
    if (p.direction === "CREDIT") matchedCredit += amount;
    else matchedDebit += amount;
  }
  let unmatchedCredit = 0;
  let unmatchedDebit = 0;
  for (const tx of monthFlows) {
    if (matchedIds.has(tx.id)) continue; // matched rows book in their item's month
    const amount = Math.abs(Number(tx.amount.toString()));
    if (tx.direction === "CREDIT") unmatchedCredit += amount;
    else unmatchedDebit += amount;
  }
  const actual = computeActualResult({
    matchedCredit,
    matchedDebit,
    unmatchedCredit,
    unmatchedDebit,
  });

  // Consolidated balance entering and leaving the viewed month (accounts have
  // no semantics — always the sum of all of them). For the current month the
  // "end" snapshot is simply the latest one; for a past month it is the last
  // snapshot inside it, so navigation shows that month's own delta.
  const consolidatedBalance =
    accounts.length > 0 && endSnapshots.some((s) => s !== null)
      ? round(
          endSnapshots.reduce(
            (sum, s) => sum + (s ? Number(s.balance.toString()) : 0),
            0
          )
        )
      : null;
  const haveAllStarts =
    accounts.length > 0 && startSnapshots.every((s) => s !== null);
  const consolidatedDelta =
    consolidatedBalance != null && haveAllStarts
      ? round(
          consolidatedBalance -
            startSnapshots.reduce((sum, s) => sum + Number(s!.balance.toString()), 0)
        )
      : null;

  const avgMonthlySpend = baselineAgg._sum.amount
    ? Math.abs(Number(baselineAgg._sum.amount.toString())) / CUSHION_BASELINE_MONTHS
    : 0;

  const reconciliation: Reconciliation = {
    ...actual,
    expectedResult: cascade.expectedResult,
    performance: performance(actual.actualResult, cascade.expectedResult),
    consolidatedDelta,
    discrepancy: reconciliationGap(consolidatedDelta, actual.actualResult),
    consolidatedBalance,
    monthsOfCushion: monthsOfCushion(consolidatedBalance, avgMonthlySpend),
  };

  // Pace reference for the viewed month: a past month is fully elapsed, a
  // future one hasn't started. Provisional applies while last month's charges
  // can still slide in — which also keeps the JUST-CLOSED month's numbers open.
  const monthElapsed =
    ahead === 0
      ? Math.round((Number(today.slice(8, 10)) / daysInMonth) * 100) / 100
      : ahead < 0
        ? 1
        : 0;
  const provisional = isProvisionalMonth(today) && (ahead === 0 || ahead === -1);

  // ── Category control (v4) ───────────────────────────────────────────────
  // Computed once over EVERY non-rollover objective (funds are excluded: their
  // polarity is inverted). Two views come out of the one list:
  //   `chargeControl` — all of them, for the month screen, where the fixed
  //                     charges are half the month and must be visible.
  //   `control`       — the discretionary ones (fixedTotal === 0), for the
  //                     daily dashboard: nothing can be decided mid-month
  //                     about rent, so it is noise there.
  // Ordered by projected deviation: where the money is escaping.
  const daysElapsedForControl =
    ahead === 0 ? Number(today.slice(8, 10)) : ahead < 0 ? daysInMonth : 1;
  // This ISO week's spend per objective (same nearest-objective rollup).
  const weekStart = isoWeekStart(today);
  const weekEnd = new Date(Date.parse(weekStart) + 6 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const weekByObjective = new Map<string, number>();
  for (const tx of variableTx) {
    if (tx.date < weekStart || tx.date > weekEnd || !tx.categoryId) continue;
    const target = nearestInSet(tx.categoryId, objectiveSet, parentOf);
    if (!target) continue;
    weekByObjective.set(target, (weekByObjective.get(target) ?? 0) + tx.amount);
  }
  const chargeControl = computeControl(
    objectives
      .filter((o) => !o.rollover)
      .map((o) => ({
        categoryId: o.categoryId,
        categoryName: o.categoryName,
        categoryColor: o.categoryColor,
        assigned: o.assigned,
        consumed: o.consumed,
        weekConsumed: round(weekByObjective.get(o.categoryId) ?? 0),
        fixedTotal: o.base,
        fixedMatched: round(matchedBaseByObjective.get(o.categoryId) ?? 0),
      })),
    daysElapsedForControl,
    daysInMonth
  );
  const control = chargeControl.filter((r) => r.fixedTotal === 0);

  return {
    year,
    month,
    today,
    provisional,
    monthElapsed,
    configured: assignedVariable > 0,
    cascade,
    weekly,
    opsThisWeek: ops.count,
    spentThisWeek: ops.spent,
    opsMedian: weeklyOpsMedian(variableTx, today),
    composition,
    variableSpentMonth,
    control,
    chargeControl,
    objectives,
    incomeObjectives,
    reconciliation,
  };
}
