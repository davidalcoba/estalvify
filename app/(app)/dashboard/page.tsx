// Dashboard, v4 — the daily screen carries TWO numbers: available this week
// and the operations counter (this user's spend driver is frequency, not
// ticket size). Below, the week's composition — informative, no limits.
// Nothing else lives here: the full breakdown, the cascade, the funds and the
// series are one tap away, to be read once a month.
//
// The greeting renders straight away and the cards stream in behind a Suspense
// boundary, the same shape Budget uses: everything below the header waits on
// the planned-state sync, and there is no reason to hold the header hostage
// to it.
//
// The greeting does await ONE thing — the member's timezone, so it can say
// "Buenas tardes" at 16:03 instead of the fixed "Buenos días" it used to.
// That costs no extra query: `getUserPrefs` is React-cached and the body
// calls it anyway, so this only decides which of the two awaits it first, and
// the header already waits on `auth()` and the language lookup. The planned
// sync — the expensive part, and the reason the boundary exists — stays
// behind it.

import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { requireScope } from "@/lib/auth/scope";
import { prisma } from "@/lib/prisma";
import { getUserPrefs } from "@/lib/user-prefs";
import { buildWeeklyStatus } from "@/lib/budget/month-status";
import { syncPlannedState } from "@/lib/planned/engine";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import {
  DASHBOARD_BODY_GRID,
  DashboardBodySkeleton,
} from "@/components/budget/dashboard-skeleton";
import { WeeklyCard } from "@/components/budget/weekly-card";
import { ControlMini } from "@/components/budget/control-mini";
import { Wallet } from "lucide-react";
import { getT } from "@/lib/i18n/server";
import type { MessageKey } from "@/lib/i18n/dictionaries/en";
import { greetingBand, hourInTimezone, type GreetingBand } from "@/lib/greeting";

/** Message keys, not labels: the band is constant, the language is not. */
const GREETING_KEY: Record<GreetingBand, MessageKey> = {
  morning: "dashboard.greeting.morning",
  afternoon: "dashboard.greeting.afternoon",
  evening: "dashboard.greeting.evening",
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("nav.dashboard") };
}

/**
 * Everything that needs the database. The body used to be pinned to a
 * `max-w-xl` centred column at every width, so a desktop rendered the phone
 * layout with empty gutters either side; it now uses the app's standard
 * two-column grid (see DASHBOARD_BODY_GRID).
 */
async function DashboardBody({
  userId,
  actorUserId,
}: {
  userId: string;
  actorUserId: string;
}) {
  const { locale, timezone, currency } = await getUserPrefs(userId, actorUserId);
  const t = await getT();

  const [hasAccounts, status] = await Promise.all([
    prisma.bankAccount
      .count({ where: { userId, isActive: true } })
      .then((n) => n > 0),
    // The schedule refresh is skipped: nothing on this screen reads
    // nextExpectedDate or lastSeenAt, and it is the expensive third of the
    // sync. See SyncPlannedOptions.
    syncPlannedState(userId, timezone, currency, locale, {
      refreshSchedule: false,
    }).then(() => buildWeeklyStatus(userId, timezone)),
  ]);

  if (!hasAccounts) {
    return (
      <EmptyState
        icon={Wallet}
        title={t("dashboard.noAccounts.title")}
        description={t("dashboard.noAccounts.body")}
      >
        <Button asChild variant="outline">
          <Link href="/accounts">{t("dashboard.noAccounts.action")}</Link>
        </Button>
      </EmptyState>
    );
  }

  return (
    <div className={DASHBOARD_BODY_GRID}>
      <WeeklyCard status={status} currency={currency} locale={locale} />
      <ControlMini control={status.control} currency={currency} locale={locale} />
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm lg:col-span-2">
        <Link href="/plan" className="text-muted-foreground underline-offset-4 hover:underline">
          {t("nav.budget")}
        </Link>
        <Link href="/forecast" className="text-muted-foreground underline-offset-4 hover:underline">
          {t("nav.forecast")}
        </Link>
        <Link href="/recurring" className="text-muted-foreground underline-offset-4 hover:underline">
          {t("nav.recurring")}
        </Link>
        <Link href="/transactions" className="text-muted-foreground underline-offset-4 hover:underline">
          {t("nav.transactions")}
        </Link>
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const scope = await requireScope("read");
  const [t, { timezone }] = await Promise.all([
    getT(),
    getUserPrefs(scope.dataUserId, scope.actorUserId),
  ]);
  const firstName =
    scope.actor.name?.split(" ")[0] ?? t("dashboard.greetingFallback");
  const greeting = GREETING_KEY[greetingBand(hourInTimezone(timezone))];

  return (
    <div className="space-y-6">
      <PageHeader title={t(greeting, { name: firstName })} />
      <Suspense fallback={<DashboardBodySkeleton />}>
        <DashboardBody userId={scope.dataUserId} actorUserId={scope.actorUserId} />
      </Suspense>
    </div>
  );
}
