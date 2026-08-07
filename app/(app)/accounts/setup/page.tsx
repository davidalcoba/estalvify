import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireScope } from "@/lib/auth/scope";
import { prisma } from "@/lib/prisma";
import { AccountSelectionForm } from "@/components/accounts/account-selection-form";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2 } from "lucide-react";

export const metadata: Metadata = { title: "Select accounts" };

type PendingAccount = {
  uid: string;
  name: string | null;
  ibanSuffix: string | null;
  currency: string;
  type: string;
};

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ connectionId?: string }>;
}) {
  const { dataUserId } = await requireScope("read");
  const { connectionId } = await searchParams;

  if (!connectionId) redirect("/accounts");

  const connection = await prisma.bankConnection.findFirst({
    where: { id: connectionId, userId: dataUserId, status: "PENDING_SETUP" },
    select: { id: true, bankName: true, pendingAccounts: true },
  });

  if (!connection) redirect("/accounts?error=setup_expired");

  const rawAccounts = (connection.pendingAccounts as PendingAccount[] | null) ?? [];

  // Filter out accounts already imported into any of the user's bank connections.
  const allUids = rawAccounts.map((a) => a.uid);
  const alreadyImported = await prisma.bankAccount.findMany({
    where: { userId: dataUserId, externalAccountId: { in: allUids } },
    select: { externalAccountId: true },
  });
  const importedUids = new Set(alreadyImported.map((a) => a.externalAccountId));

  const accounts = rawAccounts
    .filter((a) => !importedUids.has(a.uid))
    .map((a) => ({
      uid: a.uid,
      name: a.name ?? (a.ibanSuffix ? `···${a.ibanSuffix}` : a.uid.slice(0, 8)),
      iban: a.ibanSuffix ?? undefined,
      currency: a.currency,
    }));

  return (
    <div className="max-w-lg space-y-6">
      <PageHeader title={`Select accounts · ${connection.bankName}`} />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <Building2 className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <CardTitle className="text-base">{connection.bankName}</CardTitle>
              <CardDescription className="text-xs">
                {accounts.length} account{accounts.length !== 1 ? "s" : ""} available
                {importedUids.size > 0 && ` · ${importedUids.size} already imported`}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <AccountSelectionForm connectionId={connection.id} accounts={accounts} />
        </CardContent>
      </Card>
    </div>
  );
}
