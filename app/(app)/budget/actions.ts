"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { TargetType } from "@/lib/budget/budget-dto";

// ─────────────────────────────────────────────
// Assign money to a category for a specific month
// ─────────────────────────────────────────────

export async function assignToCategory(
  categoryId: string,
  year: number,
  month: number,
  amount: number
): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  const userId = session.user.id;

  // Verify the category belongs to this user or is a system category
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { userId: true, isActive: true, isNonComputable: true },
  });
  if (!category || (!category.userId && category.userId !== null && category.userId !== userId)) {
    throw new Error("Category not found");
  }
  if (category.userId !== null && category.userId !== userId) {
    throw new Error("Category not found");
  }
  if (!category.isActive || category.isNonComputable) {
    throw new Error("Category cannot be budgeted");
  }

  // Upsert the Budget record for this month
  const budget = await prisma.budget.upsert({
    where: { userId_year_month: { userId, year, month } },
    create: { userId, year, month },
    update: {},
    select: { id: true },
  });

  if (amount === 0) {
    // Remove the budget item when amount is zero
    await prisma.budgetItem.deleteMany({
      where: { budgetId: budget.id, categoryId },
    });
  } else {
    await prisma.budgetItem.upsert({
      where: { budgetId_categoryId: { budgetId: budget.id, categoryId } },
      create: { budgetId: budget.id, categoryId, plannedAmount: amount },
      update: { plannedAmount: amount },
    });
  }

  revalidatePath("/budget");
}

// ─────────────────────────────────────────────
// Set or update a category target
// ─────────────────────────────────────────────

export async function setCategoryTarget(
  categoryId: string,
  targetType: TargetType,
  amount: number,
  dueMonth: number | null,
  specificMonths: number[] | null
): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  const userId = session.user.id;

  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { userId: true, isActive: true },
  });
  if (!category) throw new Error("Category not found");
  if (category.userId !== null && category.userId !== userId) {
    throw new Error("Category not found");
  }

  await prisma.categoryTarget.upsert({
    where: { userId_categoryId: { userId, categoryId } },
    create: {
      userId,
      categoryId,
      targetType,
      amount,
      dueMonth,
      specificMonths: specificMonths ?? undefined,
    },
    update: {
      targetType,
      amount,
      dueMonth,
      specificMonths: specificMonths ?? undefined,
    },
  });

  revalidatePath("/budget");
}

// ─────────────────────────────────────────────
// Delete a category target
// ─────────────────────────────────────────────

export async function deleteCategoryTarget(categoryId: string): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  const userId = session.user.id;

  await prisma.categoryTarget.deleteMany({
    where: { userId, categoryId },
  });

  revalidatePath("/budget");
}
