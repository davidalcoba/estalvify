"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { deleteSession } from "@/lib/banking/enable-banking";
import { revalidatePath } from "next/cache";

export async function disconnectBank(connectionId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const connection = await prisma.bankConnection.findFirst({
    where: { id: connectionId, userId: session.user.id },
  });

  if (!connection) throw new Error("Connection not found");

  try {
    await deleteSession(connection.sessionId);
  } catch {
    // Session may already be expired — proceed with local deletion
  }

  await prisma.bankConnection.delete({ where: { id: connectionId } });
  revalidatePath("/accounts");
}

export async function deleteAccount(accountId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const account = await prisma.bankAccount.findFirst({
    where: { id: accountId, userId: session.user.id },
  });

  if (!account) throw new Error("Account not found");

  await prisma.bankAccount.delete({ where: { id: accountId } });
  revalidatePath("/accounts");
}

export async function renameAccount(accountId: string, name: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name cannot be empty");

  const account = await prisma.bankAccount.findFirst({
    where: { id: accountId, userId: session.user.id },
  });

  if (!account) throw new Error("Account not found");

  await prisma.bankAccount.update({
    where: { id: accountId },
    data: { name: trimmed },
  });

  revalidatePath("/accounts");
}
