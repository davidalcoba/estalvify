// Pure notification generators: given already-prepared data, return notification
// "specs" (what to create). Each spec carries a stable dedupeKey so generation is
// idempotent. No Prisma/network — unit-tested in isolation.

import type { NotificationType, NotificationSeverity } from "@/app/generated/prisma";
import type { BudgetRow } from "@/lib/budget/budget-progress";
import type { ProjectedBalance } from "@/lib/analytics/forecast";
import { firstBelowThreshold } from "@/lib/analytics/forecast";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { daysBetween } from "@/lib/recurring/detect";
import type { DuplicateGroup } from "@/lib/transactions/duplicates";

export interface NotificationSpec {
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  body: string;
  dedupeKey: string;
  metadata?: Record<string, string>;
}

// Budget alerts for the month: over budget (warning) and nearing budget (info).
export function budgetNotifications(
  year: number,
  month: number,
  rows: BudgetRow[],
  currency: string,
  locale: string
): NotificationSpec[] {
  const specs: NotificationSpec[] = [];
  for (const row of rows) {
    if (row.status === "over") {
      const over = row.spent - row.planned;
      specs.push({
        type: "BUDGET_OVER",
        severity: "WARNING",
        title: `Over budget: ${row.categoryName}`,
        body: `You've spent ${formatCurrency(row.spent, currency, locale)} of ${formatCurrency(
          row.planned,
          currency,
          locale
        )} — ${formatCurrency(over, currency, locale)} over.`,
        dedupeKey: `budget-over:${year}-${month}:${row.categoryId}`,
        metadata: { categoryId: row.categoryId, year: String(year), month: String(month) },
      });
    } else if (row.status === "warning") {
      specs.push({
        type: "BUDGET_NEAR",
        severity: "INFO",
        title: `Nearing budget: ${row.categoryName}`,
        body: `You've used ${row.percent}% of your ${row.categoryName} budget (${formatCurrency(
          row.spent,
          currency,
          locale
        )} of ${formatCurrency(row.planned, currency, locale)}).`,
        dedupeKey: `budget-near:${year}-${month}:${row.categoryId}`,
        metadata: { categoryId: row.categoryId, year: String(year), month: String(month) },
      });
    }
  }
  return specs;
}

export interface UpcomingRecurringInput {
  merchantKey: string;
  displayName: string;
  direction: "DEBIT" | "CREDIT";
  averageAmount: number;
  nextExpectedDate: string | null; // YYYY-MM-DD
}

// Alerts for confirmed recurring series due within the horizon.
export function upcomingRecurringNotifications(
  series: UpcomingRecurringInput[],
  today: string,
  currency: string,
  locale: string,
  horizonDays = 5
): NotificationSpec[] {
  const specs: NotificationSpec[] = [];
  for (const item of series) {
    if (!item.nextExpectedDate) continue;
    const days = daysBetween(today, item.nextExpectedDate);
    if (days < 0 || days > horizonDays) continue;

    const when = days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
    const amount = formatCurrency(item.averageAmount, currency, locale);
    const lead = item.direction === "CREDIT" ? "Expected" : "A payment of";

    specs.push({
      type: "RECURRING_UPCOMING",
      severity: "INFO",
      title: `Upcoming: ${item.displayName}`,
      body: `${lead} ${amount} is due ${when} (${item.nextExpectedDate}).`,
      dedupeKey: `recurring-due:${item.merchantKey}:${item.nextExpectedDate}`,
      metadata: { merchantKey: item.merchantKey },
    });
  }
  return specs;
}

/**
 * Warn about charges that look like the same payment taken more than once.
 * Clustering lives in `lib/transactions/duplicates.ts`; this only turns a
 * cluster into wording.
 *
 * Credits are skipped. The alert exists so money that left twice can be
 * disputed while the merchant still remembers the transaction — being paid
 * twice is not that, and flagging it would double the false-positive rate for
 * nothing.
 *
 * The count is part of the dedupeKey. Generation upserts with `update: {}`, so a
 * key that has already fired is silent forever; without the count, a cluster
 * that grew from two charges to three would never say so — and the third charge
 * is exactly the point at which "probably a coincidence" stops being tenable.
 * The cost is one superseded notification per growth, which the /notifications
 * history handles fine.
 */
export function duplicateChargeNotifications(
  groups: DuplicateGroup[],
  currency: string,
  locale: string,
  language: string
): NotificationSpec[] {
  const specs: NotificationSpec[] = [];
  for (const group of groups) {
    if (group.direction !== "DEBIT") continue;

    const amount = formatCurrency(group.amount, currency, locale);
    const dayLabel = (date: string) =>
      formatDate(new Date(`${date}T00:00:00Z`), language, "UTC", {
        day: "numeric",
        month: "short",
      });

    const when =
      group.spanDays === 0
        ? `on ${dayLabel(group.firstDate)}`
        : `between ${dayLabel(group.firstDate)} and ${dayLabel(group.lastDate)}`;

    specs.push({
      type: "DUPLICATE_CHARGE",
      // Three identical charges is no longer a plausible coincidence.
      severity: group.count >= 3 ? "ALERT" : "WARNING",
      title: `Possible duplicate charge: ${group.displayName}`,
      body: `${group.count} charges of ${amount} to ${group.displayName} hit ${group.accountName} ${when}. If it was meant to be paid once, check with the merchant or your bank.`,
      dedupeKey: `duplicate-charge:${group.bankAccountId}:${Math.round(
        group.amount * 100
      )}:${group.merchantKey}:${group.firstDate}:${group.count}`,
      metadata: {
        bankAccountId: group.bankAccountId,
        merchantKey: group.merchantKey,
        count: String(group.count),
        firstDate: group.firstDate,
        lastDate: group.lastDate,
        transactionIds: group.transactionIds.join(","),
      },
    });
  }
  return specs;
}

export interface ConsentInput {
  connectionId: string;
  bankName: string;
  consentExpiresAt: string | null; // YYYY-MM-DD
}

/**
 * Steps at which a bank consent expiry is announced, in days remaining.
 * PSD2 consents are granted for a fixed 90 days, so every connection WILL hit
 * this — the point is to be told before the data stops, not weeks after.
 *
 * Kept ASCENDING: the step is the tightest one that still covers the remaining
 * days, so 6 days left reports as the 7-day warning, not the 14-day one.
 */
export const CONSENT_WARNING_DAYS = [3, 7, 14] as const;

const CONSENT_STEP_SEVERITY: Record<number, NotificationSeverity> = {
  3: "ALERT",
  7: "WARNING",
  14: "INFO",
};

/**
 * Warn before a bank consent lapses. Fires once per step per consent: the key
 * embeds the step, and a reconnect moves `consentExpiresAt`, which starts a
 * fresh series rather than re-alerting for the old one.
 */
export function consentExpiringNotifications(
  connections: ConsentInput[],
  today: string,
  language: string
): NotificationSpec[] {
  const specs: NotificationSpec[] = [];
  for (const conn of connections) {
    if (!conn.consentExpiresAt) continue;
    const daysLeft = daysBetween(today, conn.consentExpiresAt);
    // Already lapsed is not this alert's job — staleTransactionNotifications
    // covers that, and /accounts shows a Reconnect button.
    if (daysLeft < 0) continue;

    const step = CONSENT_WARNING_DAYS.find((d) => daysLeft <= d);
    if (step === undefined) continue;

    const when =
      daysLeft === 0 ? "today" : daysLeft === 1 ? "tomorrow" : `in ${daysLeft} days`;
    const expiryLabel = formatDate(
      new Date(`${conn.consentExpiresAt}T00:00:00Z`),
      language,
      "UTC"
    );

    specs.push({
      type: "CONSENT_EXPIRING",
      severity: CONSENT_STEP_SEVERITY[step] ?? "WARNING",
      title: `${conn.bankName} access expires ${when}`,
      body: `Your bank consent runs out on ${expiryLabel}. Reconnect from Accounts to keep transactions flowing — once it lapses, syncing stops silently.`,
      dedupeKey: `consent-expiring:${conn.connectionId}:${step}`,
      metadata: { connectionId: conn.connectionId, daysLeft: String(daysLeft) },
    });
  }
  return specs;
}

export interface StaleAccountInput {
  accountId: string;
  accountName: string;
  lastTransactionDate: string | null; // YYYY-MM-DD
}

/** ISO-ish year-week, used to re-alert weekly instead of daily while stale. */
export function isoYearWeek(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/**
 * Catch-all for a sync that stopped without anyone noticing.
 *
 * Deliberately measured on the newest transaction, not `BankAccount.lastSyncAt`:
 * lastSyncAt is exactly the field that lies when the transactions endpoint 404s
 * or the window is stuck, since both paths still mark the sync successful.
 *
 * The key re-alerts weekly. A fixed key would fire once ever (the upsert does
 * `update: {}`), and a daily key would have produced 56 notifications during the
 * outage this was written for.
 */
export function staleTransactionNotifications(
  accounts: StaleAccountInput[],
  today: string,
  thresholdDays = 3
): NotificationSpec[] {
  const specs: NotificationSpec[] = [];
  for (const account of accounts) {
    // An account that has never had a transaction has nothing to go stale.
    if (!account.lastTransactionDate) continue;
    const days = daysBetween(account.lastTransactionDate, today);
    if (days < thresholdDays) continue;

    specs.push({
      type: "NO_TRANSACTIONS",
      severity: days >= thresholdDays * 3 ? "ALERT" : "WARNING",
      title: `No new transactions in ${account.accountName}`,
      body: `The most recent transaction is ${days} days old (${account.lastTransactionDate}). Check the connection on Accounts — it may need reconnecting.`,
      dedupeKey: `no-transactions:${account.accountId}:${isoYearWeek(today)}`,
      metadata: { accountId: account.accountId, staleDays: String(days) },
    });
  }
  return specs;
}

// Alert when the projected balance is set to fall below a threshold (default 0)
// within the forecast horizon. One alert for the earliest breaching month.
export function lowBalanceNotifications(
  projected: ProjectedBalance[],
  threshold: number,
  currency: string,
  locale: string,
  language: string
): NotificationSpec[] {
  const breach = firstBelowThreshold(projected, threshold);
  if (!breach) return [];

  const monthLabel = formatDate(
    new Date(Date.UTC(breach.year, breach.month - 1, 1)),
    language,
    "UTC",
    { month: "long", year: "numeric" }
  );

  return [
    {
      type: "LOW_BALANCE_PROJECTED",
      severity: "ALERT",
      title: "Low balance projected",
      body: `At your recent pace, your balance is projected to reach ${formatCurrency(
        breach.balance,
        currency,
        locale
      )} by ${monthLabel}.`,
      dedupeKey: `low-balance:${breach.year}-${breach.month}`,
      metadata: { year: String(breach.year), month: String(breach.month) },
    },
  ];
}
