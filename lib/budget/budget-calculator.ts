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
// Ready to Assign
// ─────────────────────────────────────────────

/**
 * Ready to Assign = total inflows (CREDIT transactions, excluding transfers)
 * minus total assigned across all budget months.
 *
 * "Transfers" are transactions with an approved categorization where the
 * category has isNonComputable = true.
 */
async function computeReadyToAssign(userId: string): Promise<number> {
  const [inflowResult, assignedResult] = await Promise.all([
    // Sum of CREDIT transactions that are NOT approved non-computable transfers
    prisma.transaction.aggregate({
      where: {
        userId,
        direction: "CREDIT",
        NOT: {
          categorization: {
            status: "APPROVED",
            category: { isNonComputable: true },
          },
        },
      },
      _sum: { amount: true },
    }),
    // Sum of all assigned amounts across all budget months for this user
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
 */
async function fetchMonthlyActivity(
  userId: string,
  year: number,
  month: number
): Promise<Map<string, number>> {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 1);

  const rows = await prisma.transactionCategorization.findMany({
    where: {
      status: "APPROVED",
      transaction: {
        userId,
        valueDate: { gte: startDate, lt: endDate },
      },
    },
    select: {
      categoryId: true,
      transaction: {
        select: { amount: true, direction: true },
      },
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
// Per-category all-time available
// ─────────────────────────────────────────────

/**
 * Available for a category = all-time assigned − all-time activity.
 * Returns a map of categoryId → available amount.
 */
async function fetchCumulativeAvailable(
  userId: string,
  upToYear: number,
  upToMonth: number
): Promise<Map<string, number>> {
  const cutoff = new Date(upToYear, upToMonth, 1); // exclusive end

  const [assignedRows, activityRows] = await Promise.all([
    // All budget items up to and including the viewed month
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
    // All approved transactions up to end of viewed month
    prisma.transactionCategorization.findMany({
      where: {
        status: "APPROVED",
        transaction: {
          userId,
          valueDate: { lt: cutoff },
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
    // Months remaining until due (inclusive of current)
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
  const [
    readyToAssign,
    monthlyActivity,
    cumulativeAvailable,
    categories,
    budgetItems,
    targets,
  ] = await Promise.all([
    computeReadyToAssign(userId),
    fetchMonthlyActivity(userId, year, month),
    fetchCumulativeAvailable(userId, year, month),
    // All active budgetable categories (flat list with parent info)
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
    // Budget items for this specific month
    prisma.budgetItem.findMany({
      where: {
        budget: { userId, year, month },
      },
      select: { categoryId: true, plannedAmount: true },
    }),
    // Targets for this user
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

  // Build lookup maps
  const assignedThisMonth = new Map<string, number>(
    budgetItems.map((bi) => [bi.categoryId, Number(bi.plannedAmount)])
  );

  const targetByCategory = new Map(targets.map((t) => [t.categoryId, t]));

  // Build category DTOs
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

  // Group categories by parent
  const groups = buildCategoryGroups(categoryDTOs);

  return {
    year,
    month,
    readyToAssign,
    currency,
    categoryGroups: groups,
  };
}

// ─────────────────────────────────────────────
// Group categories into parent groups
// ─────────────────────────────────────────────

function buildCategoryGroups(
  categories: BudgetCategoryDTO[]
): BudgetCategoryGroupDTO[] {
  // Separate top-level (parentId=null) categories from children
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

    // A parent with children acts as a group header; its own budget values
    // are summed from children (parent itself is not directly budgeted).
    const groupMembers = children.length > 0 ? children : [parent];

    const assignedTotal = groupMembers.reduce((s, c) => s + c.assigned, 0);
    const activityTotal = groupMembers.reduce((s, c) => s + c.activity, 0);
    const availableTotal = groupMembers.reduce((s, c) => s + c.available, 0);

    groups.push({
      groupId: children.length > 0 ? parent.categoryId : null,
      groupName: parent.categoryName,
      groupColor: parent.categoryColor,
      assignedTotal,
      activityTotal,
      availableTotal,
      // Only include leaf categories in the rows (skip parent headers)
      categories: children.length > 0 ? children : [parent],
    });
  }

  // Any orphaned children (parent not in active categories) get their own group
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
