"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function updatePreferences(data: {
  timezone: string;
  currency: string;
  locale: string;
}) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const { timezone, currency, locale } = data;

  // Basic validation
  if (!timezone || !currency || !locale) throw new Error("Missing fields");

  await prisma.user.update({
    where: { id: session.user.id },
    data: { timezone, currency, locale },
  });

  revalidatePath("/settings");
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
}

// ─────────────────────────────────────────────
// CATEGORY MANAGEMENT
// ─────────────────────────────────────────────

const DEFAULT_CATEGORIES: Array<{
  name: string;
  color: string;
  isNonComputable?: boolean;
  children: string[];
}> = [
  { name: "Food & Groceries", color: "#22c55e", children: ["Supermarket", "Restaurants", "Cafes", "Takeaway"] },
  { name: "Housing", color: "#3b82f6", children: ["Rent / Mortgage", "Utilities", "Maintenance"] },
  { name: "Transport", color: "#f97316", children: ["Fuel", "Public transport", "Parking", "Car insurance"] },
  { name: "Health", color: "#ec4899", children: ["Pharmacy", "Doctor", "Gym"] },
  { name: "Entertainment", color: "#8b5cf6", children: ["Streaming", "Cinema", "Sports & hobbies"] },
  { name: "Shopping", color: "#eab308", children: ["Clothing", "Electronics", "Home & garden"] },
  { name: "Income", color: "#14b8a6", children: ["Salary", "Freelance", "Other income"] },
  { name: "Transfers", color: "#6b7280", isNonComputable: true, children: ["Savings transfer", "Internal transfer"] },
];

export async function seedDefaultCategories() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  const userId = session.user.id;

  const count = await prisma.category.count({ where: { userId } });
  if (count > 0) return;

  for (let i = 0; i < DEFAULT_CATEGORIES.length; i++) {
    const cat = DEFAULT_CATEGORIES[i];
    const parent = await prisma.category.create({
      data: {
        userId,
        name: cat.name,
        color: cat.color,
        isNonComputable: cat.isNonComputable ?? false,
        sortOrder: i,
      },
    });
    for (let j = 0; j < cat.children.length; j++) {
      await prisma.category.create({
        data: {
          userId,
          name: cat.children[j],
          color: cat.color,
          parentId: parent.id,
          sortOrder: j,
        },
      });
    }
  }
}

export async function createCategory(data: { name: string; color: string }) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const name = data.name?.trim();
  if (!name) throw new Error("Name is required");

  const last = await prisma.category.findFirst({
    where: { userId: session.user.id, parentId: null, isActive: true },
    orderBy: { sortOrder: "desc" },
  });

  await prisma.category.create({
    data: {
      userId: session.user.id,
      name,
      color: data.color,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
  });

  revalidatePath("/settings");
}

export async function updateCategory(id: string, data: { name: string; color: string }) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const name = data.name?.trim();
  if (!name) throw new Error("Name is required");

  const cat = await prisma.category.findUnique({ where: { id } });
  if (!cat || cat.userId !== session.user.id) throw new Error("Not found");

  await prisma.category.update({
    where: { id },
    data: { name, color: data.color },
  });

  revalidatePath("/settings");
}

export async function deleteCategory(id: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const cat = await prisma.category.findUnique({
    where: { id },
    include: { children: true },
  });
  if (!cat || cat.userId !== session.user.id) throw new Error("Not found");

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
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const name = data.name?.trim();
  if (!name) throw new Error("Name is required");

  const parent = await prisma.category.findUnique({ where: { id: parentId } });
  if (!parent || parent.userId !== session.user.id) throw new Error("Not found");

  const last = await prisma.category.findFirst({
    where: { parentId, isActive: true },
    orderBy: { sortOrder: "desc" },
  });

  await prisma.category.create({
    data: {
      userId: session.user.id,
      name,
      color: data.color,
      parentId,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
  });

  revalidatePath("/settings");
}
