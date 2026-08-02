"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { invalidateRecurringReviewCount } from "@/lib/recurring/review-count";
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

// The Plan has no IRREGULAR cadence (it needs a monthly equivalent), so an
// irregular series is planned as MONTHLY.
function toPlanCadence(cadence: RecurringCadence) {
  return cadence === "IRREGULAR" ? "MONTHLY" : cadence;
}

export interface SeriesPlanInput {
  merchantKey: string;
  displayName: string;
  direction: TransactionDirection;
  cadence: RecurringCadence;
  averageAmount: number;
  currency: string;
  categoryId: string | null;
}

// Mirror a series into the Plan as a standing PlanItem so its amount/cadence feed
// the forecast and category limits. Idempotent: the (userId, recurringMerchantKey)
// unique index means re-running refreshes the same item instead of duplicating it.
// Returns false when the series can't be planned yet — an expense needs a category
// to show up as a limit, same rule as a manually typed plan item.
async function syncSeriesToPlan(userId: string, input: SeriesPlanInput): Promise<boolean> {
  if (input.direction === "DEBIT" && !input.categoryId) return false;

  const data = {
    label: input.displayName.slice(0, 60),
    direction: input.direction,
    categoryId: input.categoryId,
    amount: input.averageAmount,
    currency: input.currency,
    cadence: toPlanCadence(input.cadence),
    active: true,
  };

  await prisma.planItem.upsert({
    where: {
      userId_recurringMerchantKey: { userId, recurringMerchantKey: input.merchantKey },
    },
    create: { userId, recurringMerchantKey: input.merchantKey, ...data },
    update: data,
  });
  return true;
}

// Drop the plan item that mirrors a series. Only ever touches auto-linked items,
// never one the user typed themselves.
async function removeSeriesFromPlan(userId: string, merchantKey: string): Promise<void> {
  await prisma.planItem.deleteMany({ where: { userId, recurringMerchantKey: merchantKey } });
}

function revalidatePlan(): void {
  revalidatePath("/plan");
  revalidatePath("/forecast");
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
//
// Confirming also adds the series to the Plan (see `syncSeriesToPlan`): confirming
// means "yes, this is a standing charge", which is exactly what a plan item is.
// Ignoring removes that mirrored item again, so the Plan never keeps an entry for
// a series the user disowned. An uncategorized expense is simply not planned —
// the confirmation itself still succeeds.
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

  if (input.status === "CONFIRMED") {
    await syncSeriesToPlan(userId, {
      merchantKey,
      displayName: input.displayName,
      direction: input.direction,
      cadence: input.cadence,
      averageAmount: input.averageAmount,
      currency: input.currency,
      categoryId: input.categoryId,
    });
  } else {
    await removeSeriesFromPlan(userId, merchantKey);
  }

  invalidateRecurringReviewCount(userId);
  revalidatePath("/recurring");
  revalidatePath("/dashboard");
  revalidatePlan();
}

// Manual retry for a confirmed series that isn't in the Plan yet: one confirmed
// before auto-add existed, or one whose expense had no category at confirm time
// and has since been categorized. Same idempotent path as confirming.
export async function addRecurringToPlan(input: SeriesPlanInput): Promise<void> {
  const userId = await requireUserId();
  const merchantKey = input.merchantKey.trim();
  if (!merchantKey) throw new Error("Invalid series");
  if (!Number.isFinite(input.averageAmount) || input.averageAmount < 0) {
    throw new Error("Invalid amount");
  }
  if (input.categoryId) await assertCategoryAccess(userId, input.categoryId);

  const planned = await syncSeriesToPlan(userId, { ...input, merchantKey });
  if (!planned) throw new Error("Category required to plan an expense");

  revalidatePath("/recurring");
  revalidatePath("/dashboard");
  revalidatePlan();
}

// Clear a stored decision, returning the series to a plain suggestion — and with
// it the plan item the confirmation created.
export async function clearRecurringDecision(merchantKey: string): Promise<void> {
  const userId = await requireUserId();
  const key = merchantKey.trim();
  if (!key) return;

  await prisma.recurringSeries.deleteMany({
    where: { userId, merchantKey: key },
  });
  await removeSeriesFromPlan(userId, key);

  invalidateRecurringReviewCount(userId);
  revalidatePath("/recurring");
  revalidatePath("/dashboard");
  revalidatePlan();
}
