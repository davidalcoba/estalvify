// Accounts page — manage connected bank accounts
// Shows connected accounts with balance and status
// Allows connecting new banks via Enable Banking OAuth2

import type { Metadata } from "next";
import { requireScope } from "@/lib/auth/scope";
import { prisma } from "@/lib/prisma";
import { getUserPrefs } from "@/lib/user-prefs";
import { expireStaleConsents } from "@/lib/banking/connection-status";
import { monthsOfCushion } from "@/lib/budget/cascade";
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
import { getT } from "@/lib/i18n/server";
import { RichText } from "@/components/i18n/rich-text";
import type { MessageKey } from "@/lib/i18n/dictionaries/en";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("nav.bankAccounts") };
}

const STATUS_CONFIG: Record<BankConnectionStatus, { label: MessageKey; icon: React.ElementType; variant: BadgeVariant }> = {
  ACTIVE: { label: "accounts.status.ACTIVE", icon: CheckCircle2, variant: "success-soft" },
  SYNCING: { label: "accounts.status.SYNCING", icon: RefreshCw, variant: "brand-soft" },
  EXPIRED: { label: "accounts.status.EXPIRED", icon: AlertTriangle, variant: "destructive-soft" },
  PENDING_REAUTH: { label: "accounts.status.PENDING_REAUTH", icon: RefreshCw, variant: "warning-soft" },
  PENDING_SETUP: { label: "accounts.status.PENDING_SETUP", icon: RefreshCw, variant: "warning-soft" },
  REVOKED: { label: "accounts.status.REVOKED", icon: AlertTriangle, variant: "secondary" },
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
  const { dataUserId, actorUserId } = await requireScope("read");
  const params = await searchParams;
  const t = await getT();

  const errorMessages: Record<string, MessageKey> = {
    already_connected: "accounts.error.already_connected",
    connection_not_found: "accounts.error.connection_not_found",
    missing_code_or_state: "accounts.error.missing_code_or_state",
    setup_expired: "accounts.error.setup_expired",
    connection_failed: "accounts.error.connection_failed",
  };
  // Only render known error codes. An unrecognised value (e.g. a hand-crafted
  // URL) maps to a generic message rather than being reflected back verbatim.
  const callbackError = params.error
    ? t(errorMessages[params.error] ?? "common.error")
    : null;

  // Auto-recover connections stuck in SYNCING for more than 10 minutes.
  // This happens when a Vercel function timeout kills the sync job without
  // updating the connection status back to ACTIVE.
  // One clock read for the whole request: the stuck-sync cutoff and the
  // cushion baseline window both hang off it. (An async server component runs
  // once per request on the server, never during a React render.)
  const now = new Date();
  await prisma.bankConnection.updateMany({
    where: {
      userId: dataUserId,
      status: "SYNCING",
      updatedAt: { lt: new Date(now.getTime() - 10 * 60 * 1000) },
    },
    data: { status: "ACTIVE" },
  });

  // Proactively flip connections whose PSD2 consent has expired to EXPIRED, so
  // the Reconnect button appears without waiting for a sync to 401.
  await expireStaleConsents({ userId: dataUserId });

  // Six trailing months of non-transfer spend: the denominator of the cushion.
  // It used to be computed inside the month status and shown on Budget, where
  // it competed for attention with figures that actually belong to the month.
  const CUSHION_BASELINE_MONTHS = 6;
  const baselineStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - CUSHION_BASELINE_MONTHS, 1)
  );
  const baselineEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [connections, prefs, baselineAgg] = await Promise.all([
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
    getUserPrefs(dataUserId, actorUserId),
    prisma.transaction.aggregate({
      where: {
        userId: dataUserId,
        direction: "DEBIT",
        valueDate: { gte: baselineStart, lt: baselineEnd },
        NOT: { categorization: { is: { category: { is: { kind: "TRANSFER" } } } } },
      },
      _sum: { amount: true },
    }),
  ]);

  const { locale, currency, language, timezone } = prefs;

  // Where you stand, as opposed to how this month is going. Both figures used
  // to live on Budget, where they did not belong: neither moves when August's
  // decisions change, and next to numbers that do they only competed for
  // attention. Deliberately not on the daily dashboard either — that screen is
  // one number and a counter.
  const balancedAccounts = connections.flatMap((c) =>
    c.bankAccounts.filter((a) => a.balances.length > 0)
  );
  const consolidatedBalance =
    balancedAccounts.length > 0
      ? balancedAccounts.reduce((sum, a) => sum + Number(a.balances[0].balance.toString()), 0)
      : null;
  const avgMonthlySpend = baselineAgg._sum.amount
    ? Math.abs(Number(baselineAgg._sum.amount.toString())) / CUSHION_BASELINE_MONTHS
    : 0;
  const cushion = monthsOfCushion(consolidatedBalance, avgMonthlySpend);

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
            ? t("accounts.connected.syncing")
            : t("accounts.connected.ok")}
        </div>
      )}
      {params.reconnected === "true" && (
        <div className="flex items-center gap-2 rounded-lg border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">
          <CheckCircle className="h-4 w-4 shrink-0" />
          {t("accounts.reconnected")}
        </div>
      )}
      {callbackError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <XCircle className="h-4 w-4 shrink-0" />
          {callbackError}
        </div>
      )}
      <PageHeader title={t("nav.bankAccounts")} actions={<ConnectBankDialog />} />

      {consolidatedBalance != null && (
        <Card>
          <CardContent className="flex flex-wrap items-baseline gap-x-8 gap-y-2 pt-4 pb-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {t("accounts.totalBalance")}
              </p>
              <p className="text-2xl font-semibold tabular-nums">
                {formatCurrency(consolidatedBalance, currency, locale)}
              </p>
            </div>
            {cushion != null && (
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t("accounts.cushion")}
                </p>
                <p className="text-2xl font-semibold tabular-nums">{cushion}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="bg-brand/5 border-brand/20">
        <CardContent className="flex items-center gap-3 pt-4 pb-4">
          <Shield className="h-5 w-5 shrink-0 text-brand" />
          <p className="text-sm text-muted-foreground">{t("accounts.psd2")}</p>
        </CardContent>
      </Card>

      {bankGroups.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={t("accounts.empty.title")}
          description={t("accounts.empty.body")}
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
              ? { label: "accounts.status.quota" as MessageKey, icon: AlertTriangle, variant: "warning-soft" as BadgeVariant }
              : hasSyncError
                ? { label: "accounts.status.syncError" as MessageKey, icon: AlertTriangle, variant: "warning-soft" as BadgeVariant }
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
                          ? t("accounts.expiresOn", {
                              date: formatDate(group.consentExpiresAt, language, timezone),
                            })
                          : t("accounts.connectedOn", {
                              date: formatDate(group.firstConnectedAt, language, timezone),
                            })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-auto">
                      <Badge variant={badgeConfig.variant} className="gap-1 text-xs">
                        <StatusIcon className={`h-3 w-3${isSyncing ? " animate-spin" : ""}`} />
                        {t(badgeConfig.label)}
                      </Badge>
                      {isExpired ? (
                        <ReconnectBankButton
                          connectionId={group.connectionIds[0]}
                          aspspName={group.bankId}
                          aspspCountry={group.country}
                          label={t("accounts.reconnect")}
                        />
                      ) : (
                        <>
                          {isRateLimitError ? (
                            <ReconnectBankButton
                              connectionId={group.connectionIds[0]}
                              aspspName={group.bankId}
                              aspspCountry={group.country}
                              label={t("accounts.refreshAccess")}
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
                          <RichText
                            template={t("accounts.rateLimit.body")}
                            slots={{
                              title: (
                                <span className="font-medium">
                                  {t("accounts.rateLimit.title")}
                                </span>
                              ),
                              action: (
                                <span className="font-medium">
                                  {t("accounts.refreshAccess")}
                                </span>
                              ),
                            }}
                          />
                        ) : (
                          <RichText
                            template={t("accounts.syncError.body")}
                            slots={{
                              title: (
                                <span className="font-medium">
                                  {t("accounts.syncError.title")}
                                </span>
                              ),
                            }}
                          />
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
                                  {t("accounts.status.syncError")}
                                </Badge>
                              ) : latestBalance ? null : isSyncing ? (
                                <Badge variant="brand-soft" className="gap-1">
                                  <RefreshCw className="h-3 w-3 animate-spin shrink-0" />
                                  {t("accounts.status.SYNCING")}
                                </Badge>
                              ) : (
                                <Badge variant="secondary">{t("accounts.neverSynced")}</Badge>
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
