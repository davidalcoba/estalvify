import "server-only";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma";
import { getUserPrefs } from "@/lib/user-prefs";
import { syncPlannedState } from "@/lib/planned/engine";
import { buildCashflowData } from "@/lib/analytics/cashflow-data";
import { buildMonthStatus } from "@/lib/budget/month-status";
import {
  upcomingRecurringNotifications,
  cashflowBreachNotifications,
  consentExpiringNotifications,
  staleTransactionNotifications,
  type NotificationSpec,
} from "./generators";

/**
 * Generate this user's notifications, upserting by (userId, dedupeKey) so
 * re-runs never duplicate and never clobber an already-read notification.
 *
 * The planned-items engine runs first: matching transactions to expected
 * charges is what the deviation and MISSED alerts hang off (the engine writes
 * those itself), and everything below reads the freshly-matched state.
 */
export async function generateNotificationsForUser(
  userId: string,
): Promise<number> {
  const prefs = await getUserPrefs(userId);

  await syncPlannedState(userId, prefs.timezone, prefs.currency, prefs.locale);

  const [cashflow, monthStatus, connections, accounts, lastTxByAccount] =
    await Promise.all([
      buildCashflowData(userId, prefs.timezone, 60),
      buildMonthStatus(userId, prefs.timezone),
      prisma.bankConnection.findMany({
        // Every status: a lapsed consent is exactly the case worth reporting.
        where: { userId },
        select: { id: true, bankName: true, consentExpiresAt: true, status: true },
      }),
      prisma.bankAccount.findMany({
        where: { userId, isActive: true },
        select: { id: true, name: true },
      }),
      prisma.transaction.groupBy({
        by: ["bankAccountId"],
        where: { userId },
        _max: { valueDate: true },
      }),
    ]);

  const today = monthStatus.today;

  const specs: NotificationSpec[] = [
    // Due-soon reminders straight from the planned items' resolved dates.
    ...upcomingRecurringNotifications(
      cashflow.upcomingEvents.map((event) => ({
        merchantKey: event.plannedItemId,
        displayName: event.label,
        direction: event.direction,
        averageAmount: event.amount,
        nextExpectedDate: event.date,
      })),
      today,
      prefs.currency,
      prefs.locale,
    ),
    ...cashflowBreachNotifications(
      cashflow.accounts
        .filter((a) => a.breach !== null)
        .map((a) => ({
          accountId: a.accountId,
          accountName: a.accountName,
          breachDate: a.breach!.date,
          breachBalance: a.breach!.balance,
          daysAway: a.breach!.daysAway,
          minBalance: a.minBalance,
        })),
      cashflow.threshold,
      today,
      prefs.currency,
      prefs.locale,
    ),
    ...consentExpiringNotifications(
      connections
        .filter((c) => c.status !== "REVOKED")
        .map((c) => ({
          connectionId: c.id,
          bankName: c.bankName,
          consentExpiresAt: c.consentExpiresAt
            ? c.consentExpiresAt.toISOString().slice(0, 10)
            : null,
        })),
      today,
      prefs.language,
    ),
    ...staleTransactionNotifications(
      accounts.map((a) => ({
        accountId: a.id,
        accountName: a.name,
        lastTransactionDate:
          lastTxByAccount
            .find((g) => g.bankAccountId === a.id)
            ?._max.valueDate?.toISOString()
            .slice(0, 10) ?? null,
      })),
      today,
    ),
  ];

  if (specs.length === 0) return 0;

  await prisma.$transaction(
    specs.map((spec) =>
      prisma.notification.upsert({
        where: { userId_dedupeKey: { userId, dedupeKey: spec.dedupeKey } },
        create: {
          userId,
          type: spec.type,
          severity: spec.severity,
          title: spec.title,
          body: spec.body,
          dedupeKey: spec.dedupeKey,
          ...(spec.metadata
            ? { metadata: spec.metadata as Prisma.InputJsonValue }
            : {}),
        },
        // Never clobber readAt or re-alert — a matching dedupeKey is a no-op.
        update: {},
      }),
    ),
  );

  return specs.length;
}
