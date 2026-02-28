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

  // Best-effort revocation on Enable Banking side (may already be expired)
  try {
    await deleteSession(connection.sessionId);
  } catch {
    // Continue with local deletion regardless
  }

  await prisma.bankConnection.delete({ where: { id: connectionId } });
  revalidatePath("/accounts");
}
