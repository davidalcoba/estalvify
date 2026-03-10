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
 * Returns the budget start date for a user.
 *
 * The spec stores this as `budgetStartedAt` directly on the User model,
 * set to the first day of the month when the user makes their first budget
 * assignment. For users who assigned money before this field was introduced,
 * we fall back to deriving it from their earliest Budget record so they
 * don't lose their history.
 *
 * Returns null when the user has never started budgeting — all categories
 * show 0 and RTA is 0 until the first assignment is made.
 */
async function getBudgetStartDate(userId: string): Promise<Date | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { budgetStartedAt: true },
  });

  if (user?.budgetStartedAt) return user.budgetStartedAt;

  // Backward-compat fallback: derive from earliest Budget record
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
 * Ready to Assign = income since budget_started_at − total assigned across
 * all budget months.
 *
 * Income = approved transactions categorized to an inflow category
 * (category.inflow = true). The direction of the transaction is not used —
 * the category flag is the single source of truth.
 *
 * Inflow categories are NOT shown as activity in the budget; they feed RTA.
 * Refunds to spending categories (CREDIT to inflow=false) stay in the
 * category and reduce activity — they do NOT increase RTA.
 *
 * Scoped to budget_started_at so income before the user started budgeting
 * does not inflate RTA.
 */
async function computeReadyToAssign(
  userId: string,
  budgetStart: Date | null
): Promise<number> {
  if (!budgetStart) return 0;

  const [inflowResult, assignedResult] = await Promise.all([
    // Sum all approved transactions to inflow categories since budget start.
    // DEBIT to an inflow category is subtracted (rare, e.g. bank fee on income account).
    prisma.transactionCategorization.findMany({
      where: {
        status: "APPROVED",
        category: { inflow: true },
        transaction: {
          userId,
          valueDate: { gte: budgetStart },
        },
      },
      select: {
        transaction: { select: { amount: true, direction: true } },
      },
    }),
    prisma.budgetItem.aggregate({
      where: { budget: { userId } },
      _sum: { plannedAmount: true },
    }),
  ]);

  const inflows = inflowResult.reduce((sum, row) => {
    const amount = Number(row.transaction.amount);
    return sum + (row.transaction.direction === "CREDIT" ? amount : -amount);
  }, 0);

  const assigned = Number(assignedResult._sum.plannedAmount ?? 0);
  return inflows - assigned;
}

// ─────────────────────────────────────────────
// Per-category activity (net spending in a given month)
// ─────────────────────────────────────────────

/**
 * Returns a map of categoryId → net activity for the given year/month.
 * Activity = sum(DEBIT amounts) − sum(CREDIT amounts) for approved transactions
 * categorized to spending categories (inflow = false).
 *
 * Inflow categories are excluded: their transactions feed ReadyToAssign, not
 * activity. Refunds (CREDIT to a spending category) reduce activity and stay
 * in the category — they do NOT flow back to RTA.
 *
 * Positive = net spending; negative = net refund.
 *
 * Scoped to budget_started_at: if the budget hasn't started yet for this
 * month, returns an empty map.
 */
async function fetchMonthlyActivity(
  userId: string,
  year: number,
  month: number,
  budgetStart: Date | null
): Promise<Map<string, number>> {
  if (!budgetStart) return new Map();

  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1);

  if (budgetStart >= monthEnd) return new Map();

  const rows = await prisma.transactionCategorization.findMany({
    where: {
      status: "APPROVED",
      category: { inflow: false },
      transaction: {
        userId,
        valueDate: {
          gte: budgetStart > monthStart ? budgetStart : monthStart,
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
    activityMap.set(
      row.categoryId,
      prev + (row.transaction.direction === "DEBIT" ? amount : -amount)
    );
  }
  return activityMap;
}

// ─────────────────────────────────────────────
// Per-category cumulative available
// ─────────────────────────────────────────────

/**
 * Computes the Available balance for each category as of the end of the
 * viewed month.
 *
 * The spec defines the rolling formula:
 *   Available_M = Available_{M-1} + Assigned_M − Activity_M
 *
 * This is mathematically identical to the cumulative form used here:
 *   Available = Σ(assigned, from budget_start to month_end)
 *             − Σ(activity, from budget_start to month_end)
 *
 * Both yield the same value for every month. The cumulative form maps
 * directly to database aggregations and avoids iterating over every
 * prior month individually.
 *
 * All queries are scoped to budget_started_at so historical spending
 * before the user started budgeting never creates false negative balances.
 */
async function fetchCumulativeAvailable(
  userId: string,
  upToYear: number,
  upToMonth: number,
  budgetStart: Date | null
): Promise<Map<string, number>> {
  if (!budgetStart) return new Map();

  const cutoff = new Date(upToYear, upToMonth, 1);

  const [assignedRows, activityRows] = await Promise.all([
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
    // Only spending categories (inflow=false) contribute to activity.
    // Inflow category transactions feed RTA, not category available balances.
    prisma.transactionCategorization.findMany({
      where: {
        status: "APPROVED",
        category: { inflow: false },
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
    availableMap.set(
      row.categoryId,
      prev + (row.transaction.direction === "DEBIT" ? -amount : amount)
    );
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
        inflow: true,
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
      target = {
        id: rawTarget.id,
        targetType: rawTarget.targetType as TargetType,
        amount: targetAmount,
        currency: rawTarget.currency,
        dueMonth: rawTarget.dueMonth,
        specificMonths,
        suggestedAmount: computeSuggestedAmount(
          {
            targetType: rawTarget.targetType,
            amount: targetAmount,
            dueMonth: rawTarget.dueMonth,
            specificMonths,
          },
          year,
          month
        ),
      };
    }

    return {
      categoryId: cat.id,
      categoryName: cat.name,
      categoryColor: cat.color,
      categoryIcon: cat.icon,
      parentId: cat.parentId,
      parentName: cat.parent?.name ?? null,
      inflow: cat.inflow,
      assigned,
      // Inflow categories contribute to RTA, not to activity/available
      activity: cat.inflow ? 0 : activity,
      available: cat.inflow ? 0 : available,
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

  // Orphaned children (parent is inactive or not in budgetable categories)
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
