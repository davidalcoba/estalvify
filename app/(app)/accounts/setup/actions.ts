"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma";
import { send } from "@vercel/queue";
import { TOPICS, type SyncConnectionMessage } from "@/lib/queue";

type PendingAccount = {
  uid: string;
  name: string | null;
  ibanSuffix: string | null;
  currency: string;
  type: string;
};

function mapAccountType(type?: string): "CHECKING" | "SAVINGS" | "CREDIT" | "INVESTMENT" | "OTHER" {
  switch (type) {
    case "CACC": return "CHECKING";
    case "SVGS": return "SAVINGS";
    case "CARD": return "CREDIT";
    default:     return "OTHER";
  }
}

export async function finalizeSetup(connectionId: string, selectedUids: string[]) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  if (selectedUids.length === 0) throw new Error("Select at least one account");

  const connection = await prisma.bankConnection.findFirst({
    where: { id: connectionId, userId: session.user.id, status: "PENDING_SETUP" },
    select: { id: true, pendingAccounts: true },
  });

  if (!connection) throw new Error("Setup session not found or already completed");

  const allAccounts = (connection.pendingAccounts as PendingAccount[] | null) ?? [];
  const selected = allAccounts.filter((a) => selectedUids.includes(a.uid));

  if (selected.length === 0) throw new Error("None of the selected accounts were found");

  // Create accounts + activate connection + clear pendingAccounts atomically
  await prisma.$transaction(async (tx) => {
    await tx.bankConnection.update({
      where: { id: connectionId },
      data: { status: "ACTIVE", pendingAccounts: Prisma.DbNull },
    });

    return Promise.all(
      selected.map((account) =>
        tx.bankAccount.upsert({
          where: { externalAccountId: account.uid },
          create: {
            userId: session.user.id,
            bankConnectionId: connectionId,
            externalAccountId: account.uid,
            iban: account.ibanSuffix ?? null,
            name: account.name ?? (account.ibanSuffix ? `···${account.ibanSuffix}` : account.uid.slice(0, 8)),
            currency: account.currency,
            type: mapAccountType(account.type),
            isActive: true,
          },
          // Also update bankConnectionId in case this account was previously
          // imported into a different connection (e.g. user deleted the old
          // connection and reconnected). Without this, Phase 1 fan-out queries
          // accounts by bankConnectionId and silently skips the account.
          update: { bankConnectionId: connectionId, isActive: true },
        })
      )
    );
  });

  await prisma.bankConnection.update({
    where: { id: connectionId },
    data: { status: "SYNCING" },
  });

  try {
    await send<SyncConnectionMessage>(TOPICS.syncConnection, {
      connectionId,
      userId: session.user.id,
    });
  } catch (err) {
    // Queues unavailable (plan limitation, misconfiguration, etc.).
    // Revert to ACTIVE so the connection isn't stuck in SYNCING forever.
    console.error("[finalizeSetup] Failed to enqueue sync:", err);
    await prisma.bankConnection
      .update({ where: { id: connectionId }, data: { status: "ACTIVE" } })
      .catch(() => {});
  }

  redirect("/accounts?connected=true");
}

export async function cancelSetup(connectionId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.bankConnection.deleteMany({
    where: { id: connectionId, userId: session.user.id, status: "PENDING_SETUP" },
  });

  redirect("/accounts");
}
