// Accounts page — manage connected bank accounts
// Shows connected accounts with balance and status
// Allows connecting new banks via Enable Banking OAuth2

import type { Metadata } from "next";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getUserPrefs } from "@/lib/user-prefs";
import { formatDate, formatCurrency } from "@/lib/formatters";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, Building2, AlertTriangle, CheckCircle2, RefreshCw, XCircle, CheckCircle } from "lucide-react";
import { ConnectBankDialog } from "@/components/accounts/connect-bank-dialog";
import { DisconnectBankButton } from "@/components/accounts/disconnect-bank-button";
import { ReconnectBankButton } from "@/components/accounts/reconnect-bank-button";
import { SyncNowButton } from "@/components/accounts/sync-now-button";
import { AccountNameEditor } from "@/components/accounts/account-name-editor";
import { DeleteAccountButton } from "@/components/accounts/delete-account-button";
import { SyncPoller } from "@/components/accounts/sync-poller";
import type { BankConnectionStatus } from "@/app/generated/prisma";

export const metadata: Metadata = { title: "Bank Accounts" };

const STATUS_CONFIG: Record<BankConnectionStatus, { label: string; icon: React.ElementType; className: string }> = {
  ACTIVE: { label: "Connected", icon: CheckCircle2, className: "text-green-600 bg-green-50 border-green-200" },
  SYNCING: { label: "Syncing...", icon: RefreshCw, className: "text-blue-600 bg-blue-50 border-blue-200" },
  EXPIRED: { label: "Session expired", icon: AlertTriangle, className: "text-red-600 bg-red-50 border-red-200" },
  PENDING_REAUTH: { label: "Re-auth needed", icon: RefreshCw, className: "text-amber-600 bg-amber-50 border-amber-200" },
  PENDING_SETUP: { label: "Setup pending", icon: RefreshCw, className: "text-amber-600 bg-amber-50 border-amber-200" },
  REVOKED: { label: "Disconnected", icon: AlertTriangle, className: "text-slate-600 bg-slate-50 border-slate-200" },
};

// Show the most urgent status when multiple connections share a bank
const STATUS_PRIORITY: Record<BankConnectionStatus, number> = {
  ACTIVE: 0,
  SYNCING: 1,
  PENDING_REAUTH: 2,
  EXPIRED: 3,
  REVOKED: 4,
  PENDING_SETUP: 5,
};

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string; reconnected?: string }>;
}) {
  const session = await auth();
  const params = await searchParams;

  const errorMessages: Record<string, string> = {
    already_connected: "These bank accounts are already linked to your profile.",
    connection_not_found: "Connection session expired or not found. Please try again.",
    missing_code_or_state: "The authorisation request was incomplete. Please try again.",
    setup_expired: "Account setup session expired. Please connect the bank again.",
  };
  const callbackError = params.error
    ? (errorMessages[params.error] ?? decodeURIComponent(params.error))
    : null;

  const [connections, prefs] = await Promise.all([
    prisma.bankConnection.findMany({
      where: {
        userId: session!.user.id,
        status: { notIn: ["PENDING_REAUTH", "PENDING_SETUP"] },
      },
      include: {
        bankAccounts: {
          where: { isActive: true },
          include: {
            balances: { orderBy: { date: "desc" }, take: 1 },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    getUserPrefs(session!.user.id),
  ]);

  const { locale, timezone } = prefs;

  // Group connections by bankId so same-bank connections appear in one card
  type BankGroup = {
    bankId: string;
    bankName: string;
    country: string;
    connectionIds: string[];
    status: BankConnectionStatus;
    firstConnectedAt: Date;
    consentExpiresAt: Date | null;
    allAccounts: (typeof connections)[number]["bankAccounts"][number][];
  };

  const bankGroupMap = new Map<string, BankGroup>();

  for (const conn of connections) {
    const existing = bankGroupMap.get(conn.bankId);
    if (existing) {
      existing.connectionIds.push(conn.id);
      existing.allAccounts.push(...conn.bankAccounts);
      if (STATUS_PRIORITY[conn.status] < STATUS_PRIORITY[existing.status]) {
        existing.status = conn.status;
      }
      if (conn.createdAt < existing.firstConnectedAt) {
        existing.firstConnectedAt = conn.createdAt;
      }
      if (
        conn.consentExpiresAt &&
        (!existing.consentExpiresAt || conn.consentExpiresAt > existing.consentExpiresAt)
      ) {
        existing.consentExpiresAt = conn.consentExpiresAt;
      }
    } else {
      bankGroupMap.set(conn.bankId, {
        bankId: conn.bankId,
        bankName: conn.bankName,
        country: conn.country,
        connectionIds: [conn.id],
        status: conn.status,
        firstConnectedAt: conn.createdAt,
        consentExpiresAt: conn.consentExpiresAt,
        allAccounts: [...conn.bankAccounts],
      });
    }
  }

  const bankGroups = Array.from(bankGroupMap.values());
  const totalAccounts = bankGroups.reduce((sum, g) => sum + g.allAccounts.length, 0);
  const hasSyncing = bankGroups.some((g) => g.status === "SYNCING");

  return (
    <div className="space-y-6">
      {/* Polls every 3 s while any connection is syncing to keep status fresh */}
      <SyncPoller active={hasSyncing} />

      {/* Callback feedback banners */}
      {params.connected === "true" && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle className="h-4 w-4 shrink-0" />
          {hasSyncing
            ? "Bank connected. Syncing your recent transactions — this page will update automatically."
            : "Bank connected successfully."}
        </div>
      )}
      {params.reconnected === "true" && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle className="h-4 w-4 shrink-0" />
          Bank reconnected successfully. Your accounts and transaction history are intact.
        </div>
      )}
      {callbackError && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <XCircle className="h-4 w-4 shrink-0" />
          {callbackError}
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Bank Accounts</h2>
          <p className="text-muted-foreground">
            {totalAccounts > 0
              ? `${totalAccounts} account${totalAccounts !== 1 ? "s" : ""} connected across ${bankGroups.length} bank${bankGroups.length !== 1 ? "s" : ""}`
              : "Connect your bank accounts to sync transactions automatically."}
          </p>
        </div>
        <ConnectBankDialog />
      </div>

      <Card className="bg-indigo-50 border-indigo-200">
        <CardContent className="flex items-start gap-3 pt-4 pb-4">
          <Shield className="h-5 w-5 text-indigo-600 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-indigo-900">Read-only access via PSD2 open banking</p>
            <p className="text-indigo-700">
              We connect through Enable Banking — we can never initiate payments or modify your account.
              Your bank credentials are never shared with us.
            </p>
          </div>
        </CardContent>
      </Card>

      {bankGroups.length === 0 ? (
        <Card className="border-dashed">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-3">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                <Building2 className="h-6 w-6 text-slate-600" />
              </div>
            </div>
            <CardTitle>No bank accounts connected</CardTitle>
            <CardDescription>
              Connect your first bank account to start tracking your finances.
              Estalvify supports thousands of banks across Europe.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center pb-6">
            <ConnectBankDialog />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {bankGroups.map((group) => {
            const statusConfig = STATUS_CONFIG[group.status];
            const StatusIcon = statusConfig.icon;
            const isExpired = group.status === "EXPIRED";
            const isSyncing = group.status === "SYNCING";
            return (
              <Card key={group.bankId} className={isExpired ? "border-red-200" : undefined}>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                      <Building2 className="h-5 w-5 text-slate-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm leading-tight">{group.bankName}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Connected {formatDate(group.firstConnectedAt, locale, timezone)}
                        {group.consentExpiresAt && (
                          <> · Expires {formatDate(group.consentExpiresAt, locale, timezone)}</>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className={`gap-1 text-xs ${statusConfig.className}`}>
                        <StatusIcon className={`h-3 w-3${isSyncing ? " animate-spin" : ""}`} />
                        {statusConfig.label}
                      </Badge>
                      {isExpired ? (
                        <ReconnectBankButton
                          connectionId={group.connectionIds[0]}
                          aspspName={group.bankId}
                          aspspCountry={group.country}
                        />
                      ) : (
                        <SyncNowButton connectionIds={group.connectionIds} disabled={isSyncing} />
                      )}
                      <DisconnectBankButton
                        connectionIds={group.connectionIds}
                        bankName={group.bankName}
                      />
                    </div>
                  </div>
                </CardHeader>

                {group.allAccounts.length > 0 && (
                  <CardContent className="pt-0 pb-3">
                    <div className="divide-y divide-slate-100 rounded-lg border border-slate-100 overflow-hidden">
                      {group.allAccounts.map((account) => {
                        const latestBalance = account.balances[0];
                        return (
                          <div key={account.id} className="flex items-center gap-3 px-3 py-2.5 bg-slate-50">
                            {/* Account identity */}
                            <div className="flex-1 min-w-0">
                              <AccountNameEditor
                                accountId={account.id}
                                initialName={account.name}
                              />
                              {account.iban && (
                                <p className="text-xs text-muted-foreground font-mono mt-0.5">
                                  {account.iban.replace(/(.{4})/g, "$1 ").trim()}
                                </p>
                              )}
                            </div>

                            {/* Balance */}
                            <div className="flex flex-col items-end gap-1 shrink-0">
                              {latestBalance && (
                                <p className="text-sm font-semibold tabular-nums">
                                  {formatCurrency(latestBalance.balance, latestBalance.currency, locale)}
                                </p>
                              )}
                              {latestBalance ? (
                                <span className="inline-flex items-center rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                                  Synced {formatDate(latestBalance.date, locale, timezone)}
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                                  Never synced
                                </span>
                              )}
                            </div>

                            {/* Account actions */}
                            <DeleteAccountButton
                              accountId={account.id}
                              accountName={account.name}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
