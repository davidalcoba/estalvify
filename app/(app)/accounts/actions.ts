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

export async function disconnectBankGroup(connectionIds: string[]) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const connections = await prisma.bankConnection.findMany({
    where: { id: { in: connectionIds }, userId: session.user.id },
    select: { id: true, sessionId: true },
  });

  // Revoke all Enable Banking sessions (non-fatal)
  await Promise.allSettled(connections.map((c) => deleteSession(c.sessionId)));

  await prisma.bankConnection.deleteMany({
    where: { id: { in: connections.map((c) => c.id) } },
  });

  revalidatePath("/accounts");
}

export async function deleteAccount(accountId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const account = await prisma.bankAccount.findFirst({
    where: { id: accountId, userId: session.user.id },
    select: { id: true, bankConnectionId: true },
  });

  if (!account) throw new Error("Account not found");

  await prisma.bankAccount.delete({ where: { id: accountId } });

  // If no active accounts remain on this connection, clean it up too
  const remaining = await prisma.bankAccount.count({
    where: { bankConnectionId: account.bankConnectionId, isActive: true },
  });

  if (remaining === 0) {
    const connection = await prisma.bankConnection.findUnique({
      where: { id: account.bankConnectionId },
      select: { sessionId: true },
    });
    if (connection) {
      try { await deleteSession(connection.sessionId); } catch { /* already expired */ }
    }
    await prisma.bankConnection.delete({ where: { id: account.bankConnectionId } });
  }

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
