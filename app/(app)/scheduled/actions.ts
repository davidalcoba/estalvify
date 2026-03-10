"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { RepeatRule } from "@/lib/scheduled/scheduled-dto";

interface ScheduledTransactionInput {
  payeeName: string;
  amount: number;
  direction: "DEBIT" | "CREDIT";
  categoryId: string | null;
  bankAccountId: string;
  nextDate: string; // ISO date string
  repeatRule: RepeatRule;
  repeatInterval: number | null;
  notes: string | null;
}

export async function createScheduledTransaction(
  input: ScheduledTransactionInput
): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  const userId = session.user.id;

  await validateScheduledInput(userId, input);

  await prisma.scheduledTransaction.create({
    data: {
      userId,
      payeeName: input.payeeName,
      amount: input.amount,
      direction: input.direction,
      categoryId: input.categoryId,
      bankAccountId: input.bankAccountId,
      nextDate: new Date(input.nextDate),
      repeatRule: input.repeatRule,
      repeatInterval: input.repeatInterval,
      notes: input.notes,
    },
  });

  revalidatePath("/scheduled");
}

export async function updateScheduledTransaction(
  id: string,
  input: ScheduledTransactionInput
): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  const userId = session.user.id;

  const existing = await prisma.scheduledTransaction.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!existing || existing.userId !== userId) throw new Error("Not found");

  await validateScheduledInput(userId, input);

  await prisma.scheduledTransaction.update({
    where: { id },
    data: {
      payeeName: input.payeeName,
      amount: input.amount,
      direction: input.direction,
      categoryId: input.categoryId,
      bankAccountId: input.bankAccountId,
      nextDate: new Date(input.nextDate),
      repeatRule: input.repeatRule,
      repeatInterval: input.repeatInterval,
      notes: input.notes,
    },
  });

  revalidatePath("/scheduled");
}

export async function toggleScheduledTransaction(id: string): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  const userId = session.user.id;

  const existing = await prisma.scheduledTransaction.findUnique({
    where: { id },
    select: { userId: true, isActive: true },
  });
  if (!existing || existing.userId !== userId) throw new Error("Not found");

  await prisma.scheduledTransaction.update({
    where: { id },
    data: { isActive: !existing.isActive },
  });

  revalidatePath("/scheduled");
}

export async function deleteScheduledTransaction(id: string): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  const userId = session.user.id;

  const existing = await prisma.scheduledTransaction.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!existing || existing.userId !== userId) throw new Error("Not found");

  await prisma.scheduledTransaction.delete({ where: { id } });

  revalidatePath("/scheduled");
}

// ─────────────────────────────────────────────
// Validation helper
// ─────────────────────────────────────────────

async function validateScheduledInput(
  userId: string,
  input: ScheduledTransactionInput
): Promise<void> {
  if (!input.payeeName.trim()) throw new Error("Payee name is required");
  if (input.amount <= 0) throw new Error("Amount must be positive");

  const account = await prisma.bankAccount.findUnique({
    where: { id: input.bankAccountId },
    select: { userId: true },
  });
  if (!account || account.userId !== userId) throw new Error("Account not found");

  if (input.categoryId) {
    const category = await prisma.category.findUnique({
      where: { id: input.categoryId },
      select: { userId: true, isActive: true },
    });
    if (!category || (category.userId !== null && category.userId !== userId)) {
      throw new Error("Category not found");
    }
    if (!category.isActive) throw new Error("Category is inactive");
  }

  if (input.repeatRule === "CUSTOM" && (!input.repeatInterval || input.repeatInterval < 1)) {
    throw new Error("Custom repeat interval must be at least 1 day");
  }
}
