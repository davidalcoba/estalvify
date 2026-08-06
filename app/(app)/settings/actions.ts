"use server";

import { signOut } from "@/auth";
import { requireScope } from "@/lib/auth/scope";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { CategoryKind } from "@/app/generated/prisma";
import { deleteUserAccount } from "@/lib/account/delete-user";

export async function updatePreferences(data: {
  timezone: string;
  currency: string;
  locale: string;
  language: string;
}) {
  // Prefs still live in one bundle on the owner's row. The personal
  // (language/locale/timezone) vs household (currency) split is phase 5 of
  // PLAN_MULTIUSER.md.
  const { dataUserId } = await requireScope("write");

  const { timezone, currency, locale, language } = data;

  // Basic validation
  if (!timezone || !currency || !locale || !language) throw new Error("Missing fields");

  await prisma.user.update({
    where: { id: dataUserId },
    data: { timezone, currency, locale, language },
  });

  // Revalidate every route that renders dates or currency with these prefs.
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
