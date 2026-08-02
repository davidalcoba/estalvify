"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { PlanCadence, PlanDirection } from "@/lib/plan/plan-item";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  return session.user.id;
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

const CADENCES: PlanCadence[] = ["WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY", "ONE_OFF"];

export interface PlanItemFields {
  direction: PlanDirection;
  categoryId: string | null;
  label: string | null;
  amount: number;
  cadence: PlanCadence;
  dayOfMonth: number | null;
  onDate: string | null; // ISO "YYYY-MM-DD" for ONE_OFF
  endDate: string | null; // ISO "YYYY-MM-DD"; optional last month for periodic items
}

// Validate + normalize the shared fields. Throws on invalid input; returns the
// Prisma data payload (category access already checked).
async function normalizeFields(userId: string, fields: PlanItemFields, currency: string) {
  const { direction, cadence } = fields;
  if (direction !== "DEBIT" && direction !== "CREDIT") throw new Error("Invalid direction");
  if (!CADENCES.includes(cadence)) throw new Error("Invalid cadence");
  if (!Number.isFinite(fields.amount) || fields.amount < 0) throw new Error("Invalid amount");

  // Expenses must be categorized (parity with budgets); income is optional.
  const categoryId = fields.categoryId || null;
  if (direction === "DEBIT" && !categoryId) throw new Error("Category required for an expense");
  if (categoryId) await assertCategoryAccess(userId, categoryId);

  let dayOfMonth: number | null = null;
  let onDate: Date | null = null;
  if (cadence === "ONE_OFF") {
    if (!fields.onDate || !/^\d{4}-\d{2}-\d{2}$/.test(fields.onDate)) {
      throw new Error("A date is required for a one-off item");
    }
    onDate = new Date(`${fields.onDate}T00:00:00.000Z`);
    if (Number.isNaN(onDate.getTime())) throw new Error("Invalid date");
  } else if (fields.dayOfMonth != null) {
    const d = Math.trunc(fields.dayOfMonth);
    if (d < 1 || d > 31) throw new Error("Invalid day of month");
    dayOfMonth = d;
  }

  // An end date only means something for a repeating item — a one-off already
  // has its single date.
  let endDate: Date | null = null;
  if (fields.endDate && cadence !== "ONE_OFF") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.endDate)) throw new Error("Invalid end date");
    endDate = new Date(`${fields.endDate}T00:00:00.000Z`);
    if (Number.isNaN(endDate.getTime())) throw new Error("Invalid end date");
  }

  const label = fields.label?.trim() ? fields.label.trim().slice(0, 60) : null;

  return {
    direction,
    categoryId,
    label,
    amount: fields.amount,
    currency,
    cadence,
    dayOfMonth,
    onDate,
    endDate,
  };
}

function revalidate() {
  revalidatePath("/plan");
  revalidatePath("/forecast");
  revalidatePath("/dashboard");
}

// ─────────────────────────────────────────────
// Create / update / delete plan items
// ─────────────────────────────────────────────

export async function createPlanItem(fields: PlanItemFields & { currency?: string }) {
  const userId = await requireUserId();
  const data = await normalizeFields(userId, fields, fields.currency ?? "EUR");
  await prisma.planItem.create({ data: { ...data, userId } });
  revalidate();
}

export async function updatePlanItem(id: string, fields: PlanItemFields & { currency?: string }) {
  const userId = await requireUserId();
  const existing = await prisma.planItem.findUnique({ where: { id }, select: { userId: true, currency: true } });
  if (!existing || existing.userId !== userId) throw new Error("Not found");
  const data = await normalizeFields(userId, fields, fields.currency ?? existing.currency);
  await prisma.planItem.update({ where: { id }, data });
  revalidate();
}

export async function deletePlanItem(id: string) {
  const userId = await requireUserId();
  const existing = await prisma.planItem.findUnique({ where: { id }, select: { userId: true } });
  if (!existing || existing.userId !== userId) throw new Error("Not found");
  await prisma.planItem.delete({ where: { id } });
  revalidate();
}
