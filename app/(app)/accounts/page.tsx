// Accounts page — manage connected bank accounts
// Shows connected accounts with balance and status
// Allows connecting new banks via Enable Banking OAuth2

import type { Metadata } from "next";
import { requireScope } from "@/lib/auth/scope";
import { prisma } from "@/lib/prisma";
import { getUserPrefs } from "@/lib/user-prefs";
import { expireStaleConsents } from "@/lib/banking/connection-status";
import { formatDate, formatCurrency } from "@/lib/formatters";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import type { badgeVariants } from "@/components/ui/badge";
import type { VariantProps } from "class-variance-authority";
import { Shield, Building2, AlertTriangle, CheckCircle2, RefreshCw, XCircle, CheckCircle } from "lucide-react";

type BadgeVariant = VariantProps<typeof badgeVariants>["variant"];
import { ConnectBankDialog } from "@/components/accounts/connect-bank-dialog";
import { DisconnectBankButton } from "@/components/accounts/disconnect-bank-button";
import { ReconnectBankButton } from "@/components/accounts/reconnect-bank-button";
import { SyncNowButton } from "@/components/accounts/sync-now-button";
import { AccountNameEditor } from "@/components/accounts/account-name-editor";
import { DeleteAccountButton } from "@/components/accounts/delete-account-button";
import { SyncPoller } from "@/components/accounts/sync-poller";
import type { BankConnectionStatus } from "@/app/generated/prisma";

export const metadata: Metadata = { title: "Bank Accounts" };

const STATUS_CONFIG: Record<BankConnectionStatus, { label: string; icon: React.ElementType; variant: BadgeVariant }> = {
  ACTIVE: { label: "Connected", icon: CheckCircle2, variant: "success-soft" },
  SYNCING: { label: "Syncing...", icon: RefreshCw, variant: "brand-soft" },
  EXPIRED: { label: "Session expired", icon: AlertTriangle, variant: "destructive-soft" },
  PENDING_REAUTH: { label: "Re-auth needed", icon: RefreshCw, variant: "warning-soft" },
  PENDING_SETUP: { label: "Setup pending", icon: RefreshCw, variant: "warning-soft" },
  REVOKED: { label: "Disconnected", icon: AlertTriangle, variant: "secondary" },
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
  const { dataUserId } = await requireScope("read");
  const params = await searchParams;

  const errorMessages: Record<string, string> = {
    already_connected: "These bank accounts are already linked to your profile.",
    connection_not_found: "Connection session expired or not found. Please try again.",
    missing_code_or_state: "The authorisation request was incomplete. Please try again.",
    setup_expired: "Account setup session expired. Please connect the bank again.",
    connection_failed: "Something went wrong connecting your bank. Please try again.",
  };
  // Only render known error codes. An unrecognised value (e.g. a hand-crafted
  // URL) maps to a generic message rather than being reflected back verbatim.
  const callbackError = params.error
    ? (errorMessages[params.error] ?? "Something went wrong. Please try again.")
    : null;

  // Auto-recover connections stuck in SYNCING for more than 10 minutes.
  // This happens when a Vercel function timeout kills the sync job without
  // updating the connection status back to ACTIVE.
  await prisma.bankConnection.updateMany({
    where: {
      userId: dataUserId,
      status: "SYNCING",
      // eslint-disable-next-line react-hooks/purity -- async server component: runs once per request on the server, not during a React render
      updatedAt: { lt: new Date(Date.now() - 10 * 60 * 1000) },
    },
    data: { status: "ACTIVE" },
  });

  // Proactively flip connections whose PSD2 consent has expired to EXPIRED, so
  // the Reconnect button appears without waiting for a sync to 401.
  await expireStaleConsents({ userId: dataUserId });

  const [connections, prefs] = await Promise.all([
    prisma.bankConnection.findMany({
      where: {
        userId: dataUserId,
        status: { notIn: ["PENDING_REAUTH", "PENDING_SETUP"] },
      },
      include: {
        bankAccounts: {
          where: { isActive: true },
          include: {
            balances: { orderBy: { date: "desc" }, take: 1 },
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    getUserPrefs(dataUserId),
  ]);

  const { locale, language, timezone } = prefs;

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
  const hasSyncing = bankGroups.some((g) => g.status === "SYNCING");

  return (
    <div className="space-y-6">
      {/* Polls every 3 s while any connection is syncing to keep status fresh */}
      <SyncPoller active={hasSyncing} />

      {/* Callback feedback banners */}
      {params.connected === "true" && (
        <div className="flex items-center gap-2 rounded-lg border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">
          <CheckCircle className="h-4 w-4 shrink-0" />
          {hasSyncing
            ? "Bank connected. Syncing your recent transactions — this page will update automatically."
            : "Bank connected successfully."}
        </div>
      )}
      {params.reconnected === "true" && (
        <div className="flex items-center gap-2 rounded-lg border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">
          <CheckCircle className="h-4 w-4 shrink-0" />
          Bank reconnected successfully. Your accounts and transaction history are intact.
        </div>
      )}
      {callbackError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <XCircle className="h-4 w-4 shrink-0" />
          {callbackError}
        </div>
      )}
      <PageHeader title="Bank Accounts" actions={<ConnectBankDialog />} />

      <Card className="bg-brand/5 border-brand/20">
        <CardContent className="flex items-center gap-3 pt-4 pb-4">
          <Shield className="h-5 w-5 shrink-0 text-brand" />
          <p className="text-sm text-muted-foreground">
            Read-only via PSD2 — we can&apos;t move money and never see your
            credentials.
          </p>
        </CardContent>
      </Card>

      {bankGroups.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No bank accounts connected"
          description="Connect a bank to start tracking."
        >
          <ConnectBankDialog />
        </EmptyState>
      ) : (
        <div className="space-y-4">
          {bankGroups.map((group) => {
            const isExpired = group.status === "EXPIRED";
            const isSyncing = group.status === "SYNCING";
            const groupSyncError = group.allAccounts.find((a) => a.lastSyncError)?.lastSyncError ?? null;
            const hasSyncError = !isSyncing && !isExpired && !!groupSyncError;
            const isRateLimitError = hasSyncError && !!groupSyncError?.includes("RATE_LIMIT:");
            const badgeConfig = isRateLimitError
              ? { label: "Quota reached", icon: AlertTriangle, variant: "warning-soft" as BadgeVariant }
              : hasSyncError
                ? { label: "Sync error", icon: AlertTriangle, variant: "warning-soft" as BadgeVariant }
                : STATUS_CONFIG[group.status];
            const StatusIcon = badgeConfig.icon;
            return (
              <Card key={group.bankId} className={isExpired ? "border-destructive/30" : undefined}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <Building2 className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm leading-tight">{group.bankName}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {group.consentExpiresAt
                          ? `Expires ${formatDate(group.consentExpiresAt, language, timezone)}`
                          : `Connected ${formatDate(group.firstConnectedAt, language, timezone)}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-auto">
                      <Badge variant={badgeConfig.variant} className="gap-1 text-xs">
                        <StatusIcon className={`h-3 w-3${isSyncing ? " animate-spin" : ""}`} />
                        {badgeConfig.label}
                      </Badge>
                      {isExpired ? (
                        <ReconnectBankButton
                          connectionId={group.connectionIds[0]}
                          aspspName={group.bankId}
                          aspspCountry={group.country}
                          label="Reconnect"
                        />
                      ) : (
                        <>
                          {isRateLimitError ? (
                            <ReconnectBankButton
                              connectionId={group.connectionIds[0]}
                              aspspName={group.bankId}
                              aspspCountry={group.country}
                              label="Refresh access"
                              secondary
                            />
                          ) : (
                            <SyncNowButton connectionIds={group.connectionIds} disabled={isSyncing} />
                          )}
                        </>
                      )}
                      <DisconnectBankButton
                        connectionIds={group.connectionIds}
                        bankName={group.bankName}
                      />
                    </div>
                  </div>
                </CardHeader>

                {hasSyncError && (
                  <CardContent className="pt-0 pb-3">
                    <div className="flex items-start gap-2 rounded-lg border border-warning/20 bg-warning/10 px-3 py-2.5 text-xs text-warning">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span>
                        {isRateLimitError ? (
                          <>
                            <span className="font-medium">Bank rate limit reached</span> — the daily API quota
                            for this connection is exhausted. It will reset tomorrow, or use <span className="font-medium">Refresh access</span> for a fresh quota now.
                          </>
                        ) : (
                          <>
                            <span className="font-medium">Last sync had errors</span> — transactions may be incomplete.
                            Try syncing again or check back later.
                          </>
                        )}
                      </span>
                    </div>
                  </CardContent>
                )}

                {group.allAccounts.length > 0 && (
                  <CardContent className="pt-0 pb-3">
                    <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                      {group.allAccounts.map((account) => {
                        const latestBalance = account.balances[0];
                        return (
                          <div key={account.id} className="flex items-center gap-3 px-3 py-2.5 bg-muted/50">
                            {/* Account identity */}
                            <div className="flex-1 min-w-0">
                              <AccountNameEditor
                                accountId={account.id}
                                initialName={account.name}
                              />
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {account.iban && (
                                  <span className="font-mono">···{account.iban}</span>
                                )}
                                {latestBalance && (
                                  <span>
                                    {account.iban ? " · " : ""}
                                    {formatDate(latestBalance.date, language, timezone)}
                                  </span>
                                )}
                              </p>
                            </div>

                            {/* Balance + sync status */}
                            <div className="flex flex-col items-end gap-1 shrink-0">
                              {latestBalance && (
                                <p className="text-sm font-semibold tabular-nums">
                                  {formatCurrency(latestBalance.balance, latestBalance.currency, locale)}
                                </p>
                              )}
                              {account.lastSyncError ? (
                                <Badge variant="warning-soft" title={account.lastSyncError} className="gap-1">
                                  <AlertTriangle className="h-3 w-3 shrink-0" />
                                  Sync error
                                </Badge>
                              ) : latestBalance ? null : isSyncing ? (
                                <Badge variant="brand-soft" className="gap-1">
                                  <RefreshCw className="h-3 w-3 animate-spin shrink-0" />
                                  Syncing…
                                </Badge>
                              ) : (
                                <Badge variant="secondary">Never synced</Badge>
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
