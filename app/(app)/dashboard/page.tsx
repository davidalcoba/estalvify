// Dashboard, v4 — the daily screen carries TWO numbers: available this week
// and the operations counter (this user's spend driver is frequency, not
// ticket size). Below, the week's composition — informative, no limits.
// Nothing else lives here: the full breakdown, the cascade, the funds and the
// series are one tap away, to be read once a month.

import type { Metadata } from "next";
import Link from "next/link";
import { requireScope } from "@/lib/auth/scope";
import { prisma } from "@/lib/prisma";
import { getUserPrefs } from "@/lib/user-prefs";
import { buildMonthStatus } from "@/lib/budget/month-status";
import { syncPlannedState } from "@/lib/planned/engine";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { WeeklyCard } from "@/components/budget/weekly-card";
import { ControlMini } from "@/components/budget/control-mini";
import { Wallet } from "lucide-react";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const scope = await requireScope("read");
  const userId = scope.dataUserId;
  const { locale, timezone, currency } = await getUserPrefs(userId, scope.actorUserId);

  const monthStatusPromise = syncPlannedState(userId, timezone, currency, locale).then(
    () => buildMonthStatus(userId, timezone),
  );
  const hasAccounts =
    (await prisma.bankAccount.count({ where: { userId, isActive: true } })) > 0;

  const firstName = scope.actor.name?.split(" ")[0] ?? "there";

  if (!hasAccounts) {
    return (
      <div className="space-y-6">
        <PageHeader title={`Good morning, ${firstName} 👋`} />
        <EmptyState
          icon={Wallet}
          title="Connect your first bank account"
          description="Link a bank to start tracking. Syncs daily."
        >
          <Button asChild variant="outline">
            <Link href="/accounts">Go to Accounts →</Link>
          </Button>
        </EmptyState>
      </div>
    );
  }

  const monthStatus = await monthStatusPromise;

  return (
    <div className="space-y-6">
      <PageHeader title={`Good morning, ${firstName} 👋`} />
      <div className="mx-auto w-full max-w-xl space-y-4">
        <WeeklyCard status={monthStatus} currency={currency} locale={locale} />
        <ControlMini control={monthStatus.control} currency={currency} locale={locale} />
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm">
          <Link href="/plan" className="text-muted-foreground underline-offset-4 hover:underline">
            Budget
          </Link>
          <Link href="/forecast" className="text-muted-foreground underline-offset-4 hover:underline">
            Forecast
          </Link>
          <Link href="/recurring" className="text-muted-foreground underline-offset-4 hover:underline">
            Recurring
          </Link>
          <Link href="/transactions" className="text-muted-foreground underline-offset-4 hover:underline">
            Transactions
          </Link>
        </div>
      </div>
    </div>
  );
}
