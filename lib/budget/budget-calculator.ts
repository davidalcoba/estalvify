import "server-only";
import { prisma } from "@/lib/prisma";
import type {
  BudgetCategoryDTO,
  BudgetCategoryGroupDTO,
  BudgetMonthDTO,
  BudgetTargetDTO,
  TargetType,
} from "./budget-dto";

// ─────────────────────────────────────────────
// Budget start date
// ─────────────────────────────────────────────

/**
 * Returns the first day of the user's earliest budget month, or null if the
 * user has never created a budget.
 *
 * All transaction-based calculations (available, activity, RTA) are scoped to
 * this date. This prevents historical spending — before the user started
 * budgeting — from making all categories show huge negative balances.
 */
async function getBudgetStartDate(userId: string): Promise<Date | null> {
  const earliest = await prisma.budget.findFirst({
    where: { userId },
    orderBy: [{ year: "asc" }, { month: "asc" }],
    select: { year: true, month: true },
  });
  if (!earliest) return null;
  return new Date(earliest.year, earliest.month - 1, 1);
}

// ─────────────────────────────────────────────
// Ready to Assign
// ─────────────────────────────────────────────

/**
 * Ready to Assign = inflows since budget start − total assigned.
 *
 * Inflows = CREDIT transactions that are NOT approved non-computable transfers
 * (i.e., not inter-account movements). Scoped to budget start date so that
 * income earned before the user started budgeting is not included.
 */
async function computeReadyToAssign(
  userId: string,
  budgetStart: Date | null
): Promise<number> {
  const [inflowResult, assignedResult] = await Promise.all([
    prisma.transaction.aggregate({
      where: {
        userId,
        direction: "CREDIT",
        ...(budgetStart ? { valueDate: { gte: budgetStart } } : {}),
        NOT: {
          categorization: {
            status: "APPROVED",
            category: { isNonComputable: true },
          },
        },
      },
      _sum: { amount: true },
    }),
    prisma.budgetItem.aggregate({
      where: { budget: { userId } },
      _sum: { plannedAmount: true },
    }),
  ]);

  const inflows = Number(inflowResult._sum.amount ?? 0);
  const assigned = Number(assignedResult._sum.plannedAmount ?? 0);
  return inflows - assigned;
}

// ─────────────────────────────────────────────
// Per-category activity (net spending in a given month)
// ─────────────────────────────────────────────

/**
 * Returns a map of categoryId → net activity for the given year/month.
 * Activity = sum(DEBIT amounts) − sum(CREDIT amounts) for approved transactions.
 * Positive value = net spending; negative = net income/refund to category.
 *
 * Only counts transactions from budgetStart onward.
 */
async function fetchMonthlyActivity(
  userId: string,
  year: number,
  month: number,
  budgetStart: Date | null
): Promise<Map<string, number>> {
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1);

  // If budgetStart is after this month, there's no activity to show
  if (budgetStart && budgetStart >= monthEnd) {
    return new Map();
  }

  const rows = await prisma.transactionCategorization.findMany({
    where: {
      status: "APPROVED",
      transaction: {
        userId,
        valueDate: {
          gte: budgetStart && budgetStart > monthStart ? budgetStart : monthStart,
          lt: monthEnd,
        },
      },
    },
    select: {
      categoryId: true,
      transaction: { select: { amount: true, direction: true } },
    },
  });

  const activityMap = new Map<string, number>();
  for (const row of rows) {
    const prev = activityMap.get(row.categoryId) ?? 0;
    const amount = Number(row.transaction.amount);
    // DEBIT = spending (+), CREDIT = refund/income (−)
    const delta = row.transaction.direction === "DEBIT" ? amount : -amount;
    activityMap.set(row.categoryId, prev + delta);
  }
  return activityMap;
}

// ─────────────────────────────────────────────
// Per-category cumulative available
// ─────────────────────────────────────────────

/**
 * Available for a category = cumulative assigned − cumulative activity,
 * both scoped from budgetStart up to the end of the viewed month.
 *
 * Returns a map of categoryId → available amount.
 */
async function fetchCumulativeAvailable(
  userId: string,
  upToYear: number,
  upToMonth: number,
  budgetStart: Date | null
): Promise<Map<string, number>> {
  if (!budgetStart) return new Map();

  const cutoff = new Date(upToYear, upToMonth, 1); // exclusive upper bound

  const [assignedRows, activityRows] = await Promise.all([
    // Budget items up to and including the viewed month
    prisma.budgetItem.findMany({
      where: {
        budget: {
          userId,
          OR: [
            { year: { lt: upToYear } },
            { year: upToYear, month: { lte: upToMonth } },
          ],
        },
      },
      select: { categoryId: true, plannedAmount: true },
    }),
    // Approved transactions from budgetStart up to end of viewed month
    prisma.transactionCategorization.findMany({
      where: {
        status: "APPROVED",
        transaction: {
          userId,
          valueDate: { gte: budgetStart, lt: cutoff },
        },
      },
      select: {
        categoryId: true,
        transaction: { select: { amount: true, direction: true } },
      },
    }),
  ]);

  const availableMap = new Map<string, number>();

  for (const row of assignedRows) {
    const prev = availableMap.get(row.categoryId) ?? 0;
    availableMap.set(row.categoryId, prev + Number(row.plannedAmount));
  }

  for (const row of activityRows) {
    const prev = availableMap.get(row.categoryId) ?? 0;
    const amount = Number(row.transaction.amount);
    // DEBIT reduces available; CREDIT (refund) increases it
    const delta = row.transaction.direction === "DEBIT" ? -amount : amount;
    availableMap.set(row.categoryId, prev + delta);
  }

  return availableMap;
}

// ─────────────────────────────────────────────
// Target suggested amount for a given month
// ─────────────────────────────────────────────

function computeSuggestedAmount(
  target: {
    targetType: string;
    amount: number;
    dueMonth: number | null;
    specificMonths: number[] | null;
  },
  year: number,
  month: number
): number {
  if (target.targetType === "MONTHLY") {
    return target.amount;
  }

  if (target.targetType === "SPECIFIC_MONTHS") {
    const months = target.specificMonths ?? [];
    return months.includes(month) ? target.amount : 0;
  }

  if (target.targetType === "YEARLY") {
    const dueMonth = target.dueMonth ?? 12;
    const dueYear = month <= dueMonth ? year : year + 1;
    const dueDate = new Date(dueYear, dueMonth - 1, 1);
    const currentDate = new Date(year, month - 1, 1);
    const monthsRemaining =
      (dueDate.getFullYear() - currentDate.getFullYear()) * 12 +
      (dueDate.getMonth() - currentDate.getMonth()) +
      1;
    return monthsRemaining > 0
      ? Math.ceil((target.amount / monthsRemaining) * 100) / 100
      : target.amount;
  }

  return 0;
}

// ─────────────────────────────────────────────
// Main budget data fetch
// ─────────────────────────────────────────────

export async function getBudgetMonth(
  userId: string,
  year: number,
  month: number,
  currency: string
): Promise<BudgetMonthDTO> {
  // Fetch the budget start date first — all transaction queries depend on it
  const budgetStart = await getBudgetStartDate(userId);

  const [
    readyToAssign,
    monthlyActivity,
    cumulativeAvailable,
    categories,
    budgetItems,
    targets,
  ] = await Promise.all([
    computeReadyToAssign(userId, budgetStart),
    fetchMonthlyActivity(userId, year, month, budgetStart),
    fetchCumulativeAvailable(userId, year, month, budgetStart),
    prisma.category.findMany({
      where: {
        OR: [{ userId }, { userId: null }],
        isActive: true,
        isNonComputable: false,
      },
      select: {
        id: true,
        name: true,
        color: true,
        icon: true,
        parentId: true,
        parent: { select: { id: true, name: true, color: true } },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.budgetItem.findMany({
      where: { budget: { userId, year, month } },
      select: { categoryId: true, plannedAmount: true },
    }),
    prisma.categoryTarget.findMany({
      where: { userId },
      select: {
        id: true,
        categoryId: true,
        targetType: true,
        amount: true,
        currency: true,
        dueMonth: true,
        specificMonths: true,
      },
    }),
  ]);

  const assignedThisMonth = new Map<string, number>(
    budgetItems.map((bi) => [bi.categoryId, Number(bi.plannedAmount)])
  );
  const targetByCategory = new Map(targets.map((t) => [t.categoryId, t]));

  const categoryDTOs: BudgetCategoryDTO[] = categories.map((cat) => {
    const assigned = assignedThisMonth.get(cat.id) ?? 0;
    const activity = monthlyActivity.get(cat.id) ?? 0;
    const available = cumulativeAvailable.get(cat.id) ?? 0;

    const rawTarget = targetByCategory.get(cat.id);
    let target: BudgetTargetDTO | null = null;

    if (rawTarget) {
      const targetAmount = Number(rawTarget.amount);
      const specificMonths = rawTarget.specificMonths as number[] | null;
      const suggested = computeSuggestedAmount(
        {
          targetType: rawTarget.targetType,
          amount: targetAmount,
          dueMonth: rawTarget.dueMonth,
          specificMonths,
        },
        year,
        month
      );
      target = {
        id: rawTarget.id,
        targetType: rawTarget.targetType as TargetType,
        amount: targetAmount,
        currency: rawTarget.currency,
        dueMonth: rawTarget.dueMonth,
        specificMonths,
        suggestedAmount: suggested,
      };
    }

    return {
      categoryId: cat.id,
      categoryName: cat.name,
      categoryColor: cat.color,
      categoryIcon: cat.icon,
      parentId: cat.parentId,
      parentName: cat.parent?.name ?? null,
      assigned,
      activity,
      available,
      target,
    };
  });

  return {
    year,
    month,
    readyToAssign,
    currency,
    categoryGroups: buildCategoryGroups(categoryDTOs),
  };
}

// ─────────────────────────────────────────────
// Group categories into parent groups
// ─────────────────────────────────────────────

function buildCategoryGroups(
  categories: BudgetCategoryDTO[]
): BudgetCategoryGroupDTO[] {
  const parents = categories.filter((c) => !c.parentId);
  const childrenByParent = new Map<string, BudgetCategoryDTO[]>();

  for (const cat of categories) {
    if (cat.parentId) {
      const list = childrenByParent.get(cat.parentId) ?? [];
      list.push(cat);
      childrenByParent.set(cat.parentId, list);
    }
  }

  const groups: BudgetCategoryGroupDTO[] = [];

  for (const parent of parents) {
    const children = childrenByParent.get(parent.categoryId) ?? [];
    const groupMembers = children.length > 0 ? children : [parent];

    groups.push({
      groupId: children.length > 0 ? parent.categoryId : null,
      groupName: parent.categoryName,
      groupColor: parent.categoryColor,
      assignedTotal: groupMembers.reduce((s, c) => s + c.assigned, 0),
      activityTotal: groupMembers.reduce((s, c) => s + c.activity, 0),
      availableTotal: groupMembers.reduce((s, c) => s + c.available, 0),
      categories: children.length > 0 ? children : [parent],
    });
  }

  // Orphaned children (parent not in active categories)
  const parentIds = new Set(parents.map((p) => p.categoryId));
  for (const cat of categories) {
    if (cat.parentId && !parentIds.has(cat.parentId)) {
      groups.push({
        groupId: null,
        groupName: cat.categoryName,
        groupColor: cat.categoryColor,
        assignedTotal: cat.assigned,
        activityTotal: cat.activity,
        availableTotal: cat.available,
        categories: [cat],
      });
    }
  }

  return groups;
}
