"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import {
  validateSplitLines,
  type SplitLineInput,
} from "@/lib/transactions/splits";

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  return session.user.id;
}

// Replace a transaction's split lines wholesale (empty array = remove the
// split). The bank row itself is never touched — splits sit next to it. Lines
// must reconstruct the parent amount exactly; a remainder the user can't
// explain stays as an explicit uncategorized line rather than vanishing.
export async function setTransactionSplits(
  transactionId: string,
  lines: SplitLineInput[]
): Promise<void> {
  const userId = await requireUserId();

  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, userId },
    select: { id: true, amount: true },
  });
  if (!transaction) throw new Error("Transaction not found");

  if (lines.length > 0) {
    const error = validateSplitLines(
      Number(transaction.amount.toString()),
      lines
    );
    if (error) throw new Error(error);

    // Every referenced category must be visible to this user.
    const categoryIds = [
      ...new Set(lines.flatMap((l) => (l.categoryId ? [l.categoryId] : []))),
    ];
    if (categoryIds.length > 0) {
      const visible = await prisma.category.count({
        where: {
          id: { in: categoryIds },
          isActive: true,
          OR: [{ userId }, { userId: null }],
        },
      });
      if (visible !== categoryIds.length) throw new Error("Category not found");
    }
  }

  await prisma.$transaction([
    prisma.transactionSplit.deleteMany({ where: { transactionId, userId } }),
    ...(lines.length > 0
      ? [
          prisma.transactionSplit.createMany({
            data: lines.map((line) => ({
              transactionId,
              userId,
              amount: Math.abs(line.amount),
              categoryId: line.categoryId,
              note: line.note?.trim() ? line.note.trim().slice(0, 200) : null,
              isExtraordinary: line.isExtraordinary ?? false,
            })),
          }),
        ]
      : []),
  ]);

  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  revalidatePath("/plan");
}
