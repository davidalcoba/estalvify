"use server";

import { requireScope } from "@/lib/auth/scope";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { upsertBudgetItemForUser, deleteBudgetItemForUser } from "@/lib/mcp/manage";

async function requireUserId(): Promise<string> {
  const { dataUserId } = await requireScope("write");
  return dataUserId;
}

function revalidate(): void {
  revalidatePath("/plan");
  revalidatePath("/dashboard");
  revalidatePath("/forecast");
}

// v4: the monthly savings GOAL — the input the variable budget derives from.
// Stored per month so the progression stays on record. Returns the failure
// instead of throwing (production masks thrown server-action messages).
export async function setSavingsTarget(
  year: number,
  month: number,
  amount: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const userId = await requireUserId();
    if (!Number.isFinite(amount) || amount < 0) throw new Error("Invalid amount");
    if (month < 1 || month > 12) throw new Error("Invalid month");
    await prisma.budget.upsert({
      where: { userId_year_month: { userId, year, month } },
      create: { userId, year, month, savingsTarget: amount },
      update: { savingsTarget: amount },
    });
    revalidate();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// A category objective is a budget item; rollover: true makes it a fund whose
// remainder accumulates. Upserting this month's row is all it takes —
// propagation copies it forward from here.
export async function upsertBudgetObjective(
  categoryId: string,
  year: number,
  month: number,
  assigned: number,
  rollover: boolean,
): Promise<void> {
  const userId = await requireUserId();
  await upsertBudgetItemForUser(userId, {
    categoryId,
    year,
    month,
    assigned,
    rollover,
  });
  revalidate();
}

// Deleting the current month's row retires the objective: propagation only
// ever looks one month back, so nothing recreates it. History (and a fund's
// balance contribution) stays untouched.
export async function removeBudgetObjective(
  categoryId: string,
  year: number,
  month: number,
): Promise<void> {
  const userId = await requireUserId();
  await deleteBudgetItemForUser(userId, { categoryId, year, month });
  revalidate();
}

// One-off planned items (this year's IBI). Series instances are engine-owned.
export interface PlannedOneOffInput {
  description: string;
  categoryId: string | null;
  amount: number;
  year: number;
  month: number;
  dueDay: number | null;
}

export async function createPlannedOneOff(input: PlannedOneOffInput): Promise<void> {
  const userId = await requireUserId();
  const description = input.description?.trim();
  if (!description) throw new Error("Description is required");
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("Invalid amount");
  if (input.month < 1 || input.month > 12) throw new Error("Invalid month");
  if (input.dueDay != null && (input.dueDay < 1 || input.dueDay > 31)) {
    throw new Error("Invalid day");
  }
  // Without a category the charge would be orphaned in the Budget.
  if (!input.categoryId) throw new Error("Category is required");
  const cat = await prisma.category.findFirst({
    where: { id: input.categoryId, isActive: true, OR: [{ userId }, { userId: null }] },
    select: { id: true },
  });
  if (!cat) throw new Error("Category not found");
  await prisma.plannedItem.create({
    data: {
      userId,
      description: description.slice(0, 120),
      direction: "DEBIT",
      categoryId: input.categoryId,
      amount: input.amount,
      year: input.year,
      month: input.month,
      dueDay: input.dueDay,
    },
  });
  revalidate();
}

export async function deletePlannedOneOff(plannedItemId: string): Promise<void> {
  const userId = await requireUserId();
  const existing = await prisma.plannedItem.findFirst({
    where: { id: plannedItemId, userId },
    select: { recurringSeriesId: true },
  });
  if (!existing) throw new Error("Not found");
  if (existing.recurringSeriesId) {
    throw new Error("Generated from a series — edit the series instead");
  }
  await prisma.plannedItem.delete({ where: { id: plannedItemId } });
  revalidate();
}
