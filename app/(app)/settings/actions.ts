"use server";

import { signOut } from "@/auth";
import { requireScope } from "@/lib/auth/scope";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { CategoryKind, NotificationType } from "@/app/generated/prisma";
import { sendPushToSelf } from "@/lib/notifications/push";
import { deleteUserAccount } from "@/lib/account/delete-user";
import {
  createHouseholdInvite,
  revokeHouseholdInvite,
  changeHouseholdMemberRole,
  removeHouseholdMember,
  renameHousehold,
} from "@/lib/household/manage";

// Personal prefs (PLAN_MULTIUSER.md §8 / phase 5): language, number format
// and timezone belong to the ACTING member — every member, including a
// VIEWER, renders dates and numbers their own way. Level "read": it only
// writes the actor's own row.
export async function updatePersonalPreferences(data: {
  timezone: string;
  locale: string;
  language: string;
}) {
  const { actorUserId } = await requireScope("read");

  const { timezone, locale, language } = data;
  if (!timezone || !locale || !language) throw new Error("Missing fields");

  await prisma.user.update({
    where: { id: actorUserId },
    data: { timezone, locale, language },
  });

  revalidateForPrefs();
}

// Push subscriptions belong to the ACTING member's device, not to the
// household — so level "read", which every role including VIEWER passes. A
// viewer sees the bell, so a viewer may be notified on their own phone.

/**
 * Store (or refresh) the Web Push subscription for the current device.
 *
 * Keyed on the endpoint rather than the user: one member can be subscribed from
 * several devices, and a browser reissuing the same endpoint must update its row
 * instead of adding another. The upsert also re-points an endpoint at the
 * current member if a device changed hands.
 */
export async function savePushSubscription(subscription: {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}) {
  const { actorUserId } = await requireScope("read");

  const { endpoint, p256dh, auth: authKey, userAgent } = subscription;
  if (!endpoint || !p256dh || !authKey) throw new Error("Invalid subscription");

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { userId: actorUserId, endpoint, p256dh, auth: authKey, userAgent },
    update: { userId: actorUserId, p256dh, auth: authKey, userAgent },
  });

  revalidatePath("/settings");
}

/**
 * Send a push to the acting member's own devices and report what happened.
 *
 * The point is the return value: without it, "the notification never arrived"
 * is unfalsifiable from the app, since the failure lives in a Vercel log. This
 * ignores the per-type preferences on purpose — someone debugging push has
 * often switched everything off.
 */
export async function sendTestPush(): Promise<{ ok: boolean; message: string }> {
  const { actorUserId } = await requireScope("read");

  const devices = await prisma.pushSubscription.count({
    where: { userId: actorUserId },
  });
  if (devices === 0) {
    return { ok: false, message: "No device is subscribed yet." };
  }

  const result = await sendPushToSelf(actorUserId, {
    type: "LOW_BALANCE_PROJECTED",
    severity: "INFO",
    title: "Estalvify",
    body: "Push is working.",
    dedupeKey: `test:${actorUserId}`,
  });

  if (result.errors.length > 0) {
    return { ok: false, message: result.errors.join(" · ") };
  }
  if (result.sent === 0) {
    return { ok: false, message: "Nothing was sent — no reachable device." };
  }
  revalidatePath("/settings");
  return {
    ok: true,
    message: `Sent to ${result.sent} device${result.sent === 1 ? "" : "s"}.`,
  };
}

/** Choose which alert types may reach this member's phone. */
export async function updatePushTypes(types: NotificationType[]) {
  const { actorUserId } = await requireScope("read");

  await prisma.user.update({
    where: { id: actorUserId },
    data: { pushTypes: { set: types } },
  });

  revalidatePath("/settings");
}

/** Forget this device's subscription after the member turns push off. */
export async function deletePushSubscription(endpoint: string) {
  const { actorUserId } = await requireScope("read");

  // Scoped by userId so one member cannot unsubscribe another's device.
  await prisma.pushSubscription.deleteMany({
    where: { endpoint, userId: actorUserId },
  });

  revalidatePath("/settings");
}

export async function updatePreferences(data: {
  timezone: string;
  currency: string;
  locale: string;
  language: string;
}) {
  // The full bundle: personal fields land on the ACTOR's row, the currency —
  // household state, totals must not change per member — on the OWNER's.
  const { dataUserId, actorUserId } = await requireScope("write");

  const { timezone, currency, locale, language } = data;

  // Basic validation
  if (!timezone || !currency || !locale || !language) throw new Error("Missing fields");

  await prisma.$transaction([
    prisma.user.update({
      where: { id: actorUserId },
      data: { timezone, locale, language },
    }),
    prisma.user.update({
      where: { id: dataUserId },
      data: { currency },
    }),
  ]);

  revalidateForPrefs();
}

// Revalidate every route that renders dates or currency with these prefs.
function revalidateForPrefs(): void {
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/transactions");
  revalidatePath("/categorize");
  revalidatePath("/reports");
  revalidatePath("/budget");
  revalidatePath("/forecast");
  revalidatePath("/recurring");
  revalidatePath("/accounts");
}

export interface PlanningSettingsInput {
  /** Cash-flow alert threshold (0 = "don't go negative"). */
  lowBalanceThreshold: number;
}

// Planning & alert settings. Under the v3 model this is only the cash-flow
// threshold: income and charges come from planned items, savings is derived.
export async function updatePlanningSettings(input: PlanningSettingsInput) {
  const { dataUserId: userId } = await requireScope("write");

  const { lowBalanceThreshold } = input;
  if (
    !Number.isFinite(lowBalanceThreshold) ||
    Math.abs(lowBalanceThreshold) > 1_000_000
  ) {
    throw new Error("Invalid threshold");
  }

  await prisma.user.update({
    where: { id: userId },
    data: { lowBalanceThreshold },
  });

  revalidatePath("/settings");
  revalidatePath("/forecast");
  revalidatePath("/plan");
  revalidatePath("/dashboard");
}

// ─────────────────────────────────────────────
// HOUSEHOLD MEMBERS (owner-only; PLAN_MULTIUSER.md phase 2)
// ─────────────────────────────────────────────

// Mutations return their failure instead of throwing: production masks thrown
// server-action messages (same convention as /recurring).
export type MemberActionResult = { ok: true } | { ok: false; error: string };

function memberFailure(err: unknown): { ok: false; error: string } {
  return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
}

// Creates (or renews) an invitation and returns the raw token exactly once —
// the client builds the copyable /invite/<token> link from it.
export async function inviteMember(
  email: string,
  role: string
): Promise<{ ok: true; token: string; expiresAt: string } | { ok: false; error: string }> {
  try {
    const { householdId, actorUserId } = await requireScope("admin");
    const { token, expiresAt } = await createHouseholdInvite(
      householdId,
      actorUserId,
      email,
      role
    );
    revalidatePath("/settings");
    return { ok: true, token, expiresAt: expiresAt.toISOString() };
  } catch (err) {
    return memberFailure(err);
  }
}

export async function revokeMemberInvite(inviteId: string): Promise<MemberActionResult> {
  try {
    const { householdId } = await requireScope("admin");
    await revokeHouseholdInvite(householdId, inviteId);
    revalidatePath("/settings");
    return { ok: true };
  } catch (err) {
    return memberFailure(err);
  }
}

export async function updateMemberRole(
  memberId: string,
  role: string
): Promise<MemberActionResult> {
  try {
    const { householdId } = await requireScope("admin");
    await changeHouseholdMemberRole(householdId, memberId, role);
    revalidatePath("/settings");
    return { ok: true };
  } catch (err) {
    return memberFailure(err);
  }
}

export async function removeMember(memberId: string): Promise<MemberActionResult> {
  try {
    const { householdId } = await requireScope("admin");
    await removeHouseholdMember(householdId, memberId);
    revalidatePath("/settings");
    return { ok: true };
  } catch (err) {
    return memberFailure(err);
  }
}

export async function updateHouseholdName(name: string): Promise<MemberActionResult> {
  try {
    const { householdId } = await requireScope("admin");
    await renameHousehold(householdId, name);
    // The name shows in the sidebar switcher on every route.
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return memberFailure(err);
  }
}

// ─────────────────────────────────────────────
// ACCOUNT DELETION (GDPR right to erasure)
// ─────────────────────────────────────────────

// Deletes everything: PSD2 consents are revoked at Enable Banking (best
// effort), every user-owned row is removed, and the session ends. The UI
// gates this behind an explicit typed confirmation.
export async function deleteMyAccount() {
  // Owner-only: deleting the account deletes the household's data. A member
  // deleting *their own* profile (not the household) is a phase-2 flow.
  const { dataUserId } = await requireScope("admin");

  await deleteUserAccount(dataUserId);

  // The user row (and with it every session row) is gone; this clears the
  // cookie and lands on the login screen.
  await signOut({ redirectTo: "/login" });
}

// ─────────────────────────────────────────────
// CATEGORY MANAGEMENT
// ─────────────────────────────────────────────

const DEFAULT_CATEGORIES: Array<{
  name: string;
  color: string;
  kind?: CategoryKind;
  children: string[];
}> = [
  { name: "Food & Groceries", color: "#22c55e", children: ["Supermarket", "Restaurants", "Cafes", "Takeaway"] },
  { name: "Housing", color: "#3b82f6", children: ["Rent / Mortgage", "Utilities", "Maintenance"] },
  { name: "Transport", color: "#f97316", children: ["Fuel", "Public transport", "Parking", "Car insurance"] },
  { name: "Health", color: "#ec4899", children: ["Pharmacy", "Doctor", "Gym"] },
  { name: "Entertainment", color: "#8b5cf6", children: ["Streaming", "Cinema", "Sports & hobbies"] },
  { name: "Shopping", color: "#eab308", children: ["Clothing", "Electronics", "Home & garden"] },
  { name: "Income", color: "#14b8a6", kind: "INCOME", children: ["Salary", "Freelance", "Other income"] },
  { name: "Transfers", color: "#6b7280", kind: "TRANSFER", children: ["Savings transfer", "Internal transfer"] },
];

export async function seedDefaultCategories() {
  const { dataUserId: userId } = await requireScope("write");

  const count = await prisma.category.count({ where: { userId } });
  if (count > 0) return;

  for (let i = 0; i < DEFAULT_CATEGORIES.length; i++) {
    const cat = DEFAULT_CATEGORIES[i];
    const parent = await prisma.category.create({
      data: {
        userId,
        name: cat.name,
        color: cat.color,
        kind: cat.kind ?? "EXPENSE",
        sortOrder: i,
      },
    });
    for (let j = 0; j < cat.children.length; j++) {
      await prisma.category.create({
        data: {
          userId,
          name: cat.children[j],
          color: cat.color,
          // Children inherit the parent's kind. The previous seed only flagged
          // the parent, so "Savings transfer" and "Internal transfer" were left
          // looking like ordinary expenses.
          kind: cat.kind ?? "EXPENSE",
          parentId: parent.id,
          sortOrder: j,
        },
      });
    }
  }
}

export async function createCategory(data: { name: string; color: string }) {
  const { dataUserId } = await requireScope("write");

  const name = data.name?.trim();
  if (!name) throw new Error("Name is required");

  const last = await prisma.category.findFirst({
    where: { userId: dataUserId, parentId: null, isActive: true },
    orderBy: { sortOrder: "desc" },
  });

  await prisma.category.create({
    data: {
      userId: dataUserId,
      name,
      color: data.color,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
  });

  revalidatePath("/settings");
}

export async function updateCategory(id: string, data: { name: string; color: string }) {
  const { dataUserId } = await requireScope("write");

  const name = data.name?.trim();
  if (!name) throw new Error("Name is required");

  const cat = await prisma.category.findUnique({ where: { id } });
  if (!cat || cat.userId !== dataUserId) throw new Error("Not found");

  await prisma.category.update({
    where: { id },
    data: { name, color: data.color },
  });

  revalidatePath("/settings");
}

export async function deleteCategory(id: string) {
  const { dataUserId } = await requireScope("write");

  const cat = await prisma.category.findUnique({
    where: { id },
    include: { children: true },
  });
  if (!cat || cat.userId !== dataUserId) throw new Error("Not found");

  // Soft-delete children first
  if (cat.children.length > 0) {
    await prisma.category.updateMany({
      where: { parentId: id },
      data: { isActive: false },
    });
  }

  await prisma.category.update({
    where: { id },
    data: { isActive: false },
  });

  revalidatePath("/settings");
}

export async function createSubcategory(parentId: string, data: { name: string; color: string }) {
  const { dataUserId } = await requireScope("write");

  const name = data.name?.trim();
  if (!name) throw new Error("Name is required");

  const parent = await prisma.category.findUnique({ where: { id: parentId } });
  if (!parent || parent.userId !== dataUserId) throw new Error("Not found");

  const last = await prisma.category.findFirst({
    where: { parentId, isActive: true },
    orderBy: { sortOrder: "desc" },
  });

  await prisma.category.create({
    data: {
      userId: dataUserId,
      name,
      color: data.color,
      parentId,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
  });

  revalidatePath("/settings");
}
