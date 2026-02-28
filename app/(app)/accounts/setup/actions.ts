"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { type EnableBankingAccount } from "@/lib/banking/enable-banking";
import { syncConnection, toDateString } from "@/lib/banking/sync";

function buildAccountName(account: EnableBankingAccount): string {
  // Try every API text field before falling back to IBAN — different banks
  // populate different fields (BBVA uses `product`, others use `name` or `details`)
  const apiName = account.name || account.product || account.details;
  if (apiName) return apiName;
  const iban = account.account_id?.iban;
  if (iban) return `···${iban.slice(-4)}`;
  return account.uid.slice(0, 8);
}

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
  });

  if (!connection) throw new Error("Setup session not found or already completed");

  const allAccounts = ((connection.sessionData as { accounts?: EnableBankingAccount[] })?.accounts ?? []);
  const selected = allAccounts.filter((a) => selectedUids.includes(a.uid));

  if (selected.length === 0) throw new Error("None of the selected accounts were found");

  // Create accounts + activate connection atomically
  const savedAccounts = await prisma.$transaction(async (tx) => {
    await tx.bankConnection.update({
      where: { id: connectionId },
      data: { status: "ACTIVE" },
    });

    return Promise.all(
      selected.map((account) =>
        tx.bankAccount.upsert({
          where: { externalAccountId: account.uid },
          create: {
            userId: session.user.id,
            bankConnectionId: connectionId,
            externalAccountId: account.uid,
            iban: account.account_id?.iban,
            name: buildAccountName(account),
            currency: account.currency,
            type: mapAccountType(account.cash_account_type),
            isActive: true,
          },
          update: { isActive: true },
        })
      )
    );
  });

  // Initial sync — non-fatal.
  // Start from yesterday (1 day back) so we capture today's transactions
  // without pulling a large history; subsequent syncs extend from lastSyncAt.
  const dateTo = toDateString(new Date());
  const dateFrom = toDateString(new Date(Date.now() - 24 * 60 * 60 * 1000));

  // Set status to SYNCING so the UI can show progress while we wait.
  await prisma.bankConnection.update({
    where: { id: connectionId },
    data: { status: "SYNCING" },
  });

  await syncConnection(
    { ...connection, bankAccounts: savedAccounts },
    dateFrom,
    dateTo
  ).catch((err) => console.error("Initial sync failed (non-fatal):", err));

  // Restore ACTIVE regardless of sync outcome so the user can interact.
  await prisma.bankConnection.update({
    where: { id: connectionId },
    data: { status: "ACTIVE" },
  });

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
