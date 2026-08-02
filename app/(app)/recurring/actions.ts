"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type {
  TransactionDirection,
  RecurringStatus,
  RecurringCadence,
} from "@/app/generated/prisma";

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  return session.user.id;
}

async function assertCategoryAccess(userId: string, categoryId: string): Promise<void> {
  const cat = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { userId: true, isActive: true },
  });
  if (!cat || (cat.userId !== null && cat.userId !== userId) || !cat.isActive) {
    throw new Error("Category not found");
  }
}

function toDateOrNull(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export interface RecurringDecisionInput {
  merchantKey: string;
  displayName: string;
  direction: TransactionDirection;
  cadence: RecurringCadence;
  averageAmount: number;
  currency: string;
  lastSeen: string | null;
  nextExpected: string | null;
  categoryId: string | null;
  status: RecurringStatus;
}

// Persist the user's confirm/ignore decision for a detected series, snapshotting
// the detected cadence/amount for future forecasting and alerts. Keyed by
// (userId, merchantKey) so it stays attached to the same merchant across syncs.
export async function setRecurringDecision(
  input: RecurringDecisionInput
): Promise<void> {
  const userId = await requireUserId();

  const merchantKey = input.merchantKey.trim();
  if (!merchantKey) throw new Error("Invalid series");
  if (!Number.isFinite(input.averageAmount) || input.averageAmount < 0) {
    throw new Error("Invalid amount");
  }
  if (input.categoryId) await assertCategoryAccess(userId, input.categoryId);

  const data = {
    displayName: input.displayName.slice(0, 200),
    direction: input.direction,
    cadence: input.cadence,
    averageAmount: input.averageAmount,
    currency: input.currency,
    lastSeenAt: toDateOrNull(input.lastSeen),
    nextExpectedDate: toDateOrNull(input.nextExpected),
    categoryId: input.categoryId,
    status: input.status,
  };

  await prisma.recurringSeries.upsert({
    where: { userId_merchantKey: { userId, merchantKey } },
    create: { userId, merchantKey, ...data },
    update: data,
  });

  revalidatePath("/recurring");
  revalidatePath("/dashboard");
}

// Add a detected series to the Plan as a standing PlanItem, so its amount/cadence
// feed the forecast and category limits without retyping. IRREGULAR falls back to
// MONTHLY. Creates a new plan item each time (the user manages duplicates).
export async function addRecurringToPlan(input: {
  displayName: string;
  direction: TransactionDirection;
  cadence: RecurringCadence;
  averageAmount: number;
  currency: string;
  categoryId: string | null;
}): Promise<void> {
  const userId = await requireUserId();
  if (!Number.isFinite(input.averageAmount) || input.averageAmount < 0) {
    throw new Error("Invalid amount");
  }
  if (input.categoryId) await assertCategoryAccess(userId, input.categoryId);
  // Expenses need a category to show as a limit; skip the mapping if missing.
  if (input.direction === "DEBIT" && !input.categoryId) {
    throw new Error("Category required to plan an expense");
  }

  const cadence = input.cadence === "IRREGULAR" ? "MONTHLY" : input.cadence;

  await prisma.planItem.create({
    data: {
      userId,
      label: input.displayName.slice(0, 60),
      direction: input.direction,
      categoryId: input.categoryId,
      amount: input.averageAmount,
      currency: input.currency,
      cadence,
    },
  });

  revalidatePath("/plan");
  revalidatePath("/forecast");
  revalidatePath("/dashboard");
}

// Clear a stored decision, returning the series to a plain suggestion.
export async function clearRecurringDecision(merchantKey: string): Promise<void> {
  const userId = await requireUserId();
  const key = merchantKey.trim();
  if (!key) return;

  await prisma.recurringSeries.deleteMany({
    where: { userId, merchantKey: key },
  });

  revalidatePath("/recurring");
  revalidatePath("/dashboard");
}
