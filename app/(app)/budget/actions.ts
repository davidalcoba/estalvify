"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  return session.user.id;
}

function assertValidMonth(year: number, month: number): void {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12 ||
    year < 2000 ||
    year > 3000
  ) {
    throw new Error("Invalid month");
  }
}

// System categories (userId null) are shared; user categories must belong to the user.
async function assertCategoryAccess(userId: string, categoryId: string): Promise<void> {
  const cat = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { userId: true, isActive: true },
  });
  if (!cat || (cat.userId !== null && cat.userId !== userId) || !cat.isActive) {
    throw new Error("Category not found");
  }
}

// Get-or-create the budget for a month without clobbering existing items.
async function upsertMonthBudget(
  userId: string,
  year: number,
  month: number
): Promise<string> {
  const budget = await prisma.budget.upsert({
    where: { userId_year_month: { userId, year, month } },
    create: { userId, year, month },
    update: {},
    select: { id: true },
  });
  return budget.id;
}

function previousMonth(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

// ─────────────────────────────────────────────
// Set / update a category's planned amount
// ─────────────────────────────────────────────

export async function saveBudgetItem(input: {
  year: number;
  month: number;
  categoryId: string;
  plannedAmount: number;
  currency?: string;
}): Promise<void> {
  const userId = await requireUserId();
  assertValidMonth(input.year, input.month);
  if (!Number.isFinite(input.plannedAmount) || input.plannedAmount < 0) {
    throw new Error("Invalid amount");
  }
  await assertCategoryAccess(userId, input.categoryId);

  const budgetId = await upsertMonthBudget(userId, input.year, input.month);

  await prisma.budgetItem.upsert({
    where: { budgetId_categoryId: { budgetId, categoryId: input.categoryId } },
    create: {
      budgetId,
      categoryId: input.categoryId,
      plannedAmount: input.plannedAmount,
      currency: input.currency ?? "EUR",
    },
    update: { plannedAmount: input.plannedAmount },
  });

  revalidatePath("/budget");
  revalidatePath("/dashboard");
}

// ─────────────────────────────────────────────
// Remove a category from the budget
// ─────────────────────────────────────────────

export async function removeBudgetItem(input: {
  year: number;
  month: number;
  categoryId: string;
}): Promise<void> {
  const userId = await requireUserId();
  assertValidMonth(input.year, input.month);

  const budget = await prisma.budget.findUnique({
    where: { userId_year_month: { userId, year: input.year, month: input.month } },
    select: { id: true },
  });
  if (!budget) return;

  await prisma.budgetItem.deleteMany({
    where: { budgetId: budget.id, categoryId: input.categoryId },
  });

  revalidatePath("/budget");
  revalidatePath("/dashboard");
}

// ─────────────────────────────────────────────
// Copy the previous month's planned amounts into this month
// ─────────────────────────────────────────────

export async function copyPreviousMonthBudget(input: {
  year: number;
  month: number;
}): Promise<{ copied: number }> {
  const userId = await requireUserId();
  assertValidMonth(input.year, input.month);

  const prev = previousMonth(input.year, input.month);
  const prevBudget = await prisma.budget.findUnique({
    where: { userId_year_month: { userId, year: prev.year, month: prev.month } },
    select: {
      budgetItems: { select: { categoryId: true, plannedAmount: true, currency: true } },
    },
  });
  if (!prevBudget || prevBudget.budgetItems.length === 0) return { copied: 0 };

  const budgetId = await upsertMonthBudget(userId, input.year, input.month);

  await prisma.$transaction(
    prevBudget.budgetItems.map((item) =>
      prisma.budgetItem.upsert({
        where: { budgetId_categoryId: { budgetId, categoryId: item.categoryId } },
        create: {
          budgetId,
          categoryId: item.categoryId,
          plannedAmount: item.plannedAmount,
          currency: item.currency,
        },
        update: { plannedAmount: item.plannedAmount },
      })
    )
  );

  revalidatePath("/budget");
  revalidatePath("/dashboard");
  return { copied: prevBudget.budgetItems.length };
}
