// Categorization writes parameterized by userId, for use from the MCP tools
// (which authenticate via a token, not an Auth.js session, so they can't call
// the server actions in app/(app)/categorize/actions.ts directly).
//
// Mirrors the upsert semantics of those actions: MANUAL source, APPROVED status.

import { prisma } from "@/lib/prisma";
import { buildUncategorizedWhere } from "@/lib/categorize";

/** Safety cap so a single bulk call can't rewrite an unbounded number of rows. */
export const BULK_CATEGORIZE_CAP = 1000;

async function assertOwnedCategory(userId: string, categoryId: string) {
  const cat = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { userId: true, isActive: true },
  });
  // Category must be the user's own or a system default (userId null), and active.
  if (!cat || (cat.userId !== null && cat.userId !== userId) || !cat.isActive) {
    throw new Error("Category not found");
  }
}

/**
 * Approve-categorize a set of the user's transactions under `categoryId`.
 * Target either an explicit list of transaction ids or all uncategorized
 * transactions matching an optional search string. Returns the number written.
 */
export async function bulkCategorizeForUser(
  userId: string,
  categoryId: string,
  target: { transactionIds?: string[]; search?: string },
): Promise<number> {
  await assertOwnedCategory(userId, categoryId);

  const where =
    target.transactionIds && target.transactionIds.length > 0
      ? { id: { in: target.transactionIds }, userId }
      : buildUncategorizedWhere(userId, target.search);

  const txs = await prisma.transaction.findMany({
    where,
    select: { id: true },
    take: BULK_CATEGORIZE_CAP + 1,
  });

  if (txs.length > BULK_CATEGORIZE_CAP) {
    throw new Error(
      `Too many matching transactions (> ${BULK_CATEGORIZE_CAP}). Narrow the selection with a search term or explicit ids.`,
    );
  }
  if (txs.length === 0) return 0;

  const now = new Date();
  await prisma.$transaction(
    txs.map((tx) =>
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
      }),
    ),
  );

  return txs.length;
}
