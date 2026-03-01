"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { buildUncategorizedWhere } from "@/lib/categorize";

// ─────────────────────────────────────────────
// Single transaction categorization
// ─────────────────────────────────────────────

export async function categorizeTransaction(transactionId: string, categoryId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  const userId = session.user.id;

  const [tx, cat] = await Promise.all([
    prisma.transaction.findUnique({ where: { id: transactionId }, select: { userId: true } }),
    prisma.category.findUnique({ where: { id: categoryId }, select: { userId: true, isActive: true } }),
  ]);

  if (!tx || tx.userId !== userId) throw new Error("Transaction not found");
  if (!cat || (cat.userId !== null && cat.userId !== userId) || !cat.isActive) {
    throw new Error("Category not found");
  }

  await prisma.transactionCategorization.upsert({
    where: { transactionId },
    create: {
      transactionId,
      categoryId,
      source: "MANUAL",
      status: "APPROVED",
      approvedAt: new Date(),
    },
    update: {
      categoryId,
      source: "MANUAL",
      status: "APPROVED",
      approvedAt: new Date(),
      rejectedAt: null,
      note: null,
    },
  });

  revalidatePath("/categorize");
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
}

// ─────────────────────────────────────────────
// Bulk categorization (all matching search)
// ─────────────────────────────────────────────

export async function bulkCategorize(searchQuery: string, categoryId: string): Promise<number> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  const userId = session.user.id;

  const cat = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { userId: true, isActive: true },
  });
  if (!cat || (cat.userId !== null && cat.userId !== userId) || !cat.isActive) {
    throw new Error("Category not found");
  }

  const where = buildUncategorizedWhere(userId, searchQuery);
  const transactions = await prisma.transaction.findMany({ where, select: { id: true } });

  if (transactions.length === 0) return 0;

  const now = new Date();
  await prisma.$transaction(
    transactions.map((tx) =>
      prisma.transactionCategorization.upsert({
        where: { transactionId: tx.id },
        create: {
          transactionId: tx.id,
          categoryId,
          source: "MANUAL",
          status: "APPROVED",
          approvedAt: now,
        },
        update: {
          categoryId,
          source: "MANUAL",
          status: "APPROVED",
          approvedAt: now,
          rejectedAt: null,
          note: null,
        },
      })
    )
  );

  revalidatePath("/categorize");
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  return transactions.length;
}
