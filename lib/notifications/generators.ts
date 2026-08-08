// Pure notification generators: given already-prepared data, return notification
// "specs" (what to create). Each spec carries a stable dedupeKey so generation is
// idempotent. No Prisma/network — unit-tested in isolation.

import type { NotificationType, NotificationSeverity } from "@/app/generated/prisma";
import { formatCurrency, formatDate } from "@/lib/formatters";
import type { Translator } from "@/lib/i18n/translate";

// Notification copy is written in the HOUSEHOLD OWNER's language, not the
// reader's: a spec is persisted once, shared by every member and pushed to
// their phones, so there is no per-reader render to translate at. Callers pass
// the translator (lib/notifications/generate.ts builds it from the owner's
// `language`); these functions stay pure.

/** Whole-day difference between two ISO dates (UTC). */
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

export interface NotificationSpec {
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  body: string;
  dedupeKey: string;
  metadata?: Record<string, string>;
}

/**
 * The specs that do not exist yet, given the dedupeKeys already stored.
 *
 * Generation is idempotent and re-runs daily, so on any given run most specs
 * describe an alert the user has already seen. Push delivery must be limited to
 * genuinely new ones — pushing the whole list would re-notify the same budget
 * warning every single cron run.
 */
export function unseenSpecs(
  specs: NotificationSpec[],
  knownDedupeKeys: Iterable<string>,
): NotificationSpec[] {
  const known = new Set(knownDedupeKeys);
  return specs.filter((spec) => !known.has(spec.dedupeKey));
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
  t: Translator,
  horizonDays = 5
): NotificationSpec[] {
  const specs: NotificationSpec[] = [];
  for (const item of series) {
    if (!item.nextExpectedDate) continue;
    const days = daysBetween(today, item.nextExpectedDate);
    if (days < 0 || days > horizonDays) continue;

    const when =
      days === 0
        ? t("notif.when.today")
        : days === 1
          ? t("notif.when.tomorrow")
          : t("notif.when.inDays", { count: days });
    const amount = formatCurrency(item.averageAmount, currency, locale);

    specs.push({
      type: "RECURRING_UPCOMING",
      severity: "INFO",
      title: item.displayName,
      body: t(
        item.direction === "CREDIT" ? "notif.recurring.credit" : "notif.recurring.debit",
        { amount, when },
      ),
      dedupeKey: `recurring-due:${item.merchantKey}:${item.nextExpectedDate}`,
      metadata: { merchantKey: item.merchantKey },
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
  language: string,
  t: Translator
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
      daysLeft === 0
        ? t("notif.when.today")
        : daysLeft === 1
          ? t("notif.when.tomorrow")
          : t("notif.when.inDays", { count: daysLeft });
    const expiryLabel = formatDate(
      new Date(`${conn.consentExpiresAt}T00:00:00Z`),
      language,
      "UTC"
    );

    specs.push({
      type: "CONSENT_EXPIRING",
      severity: CONSENT_STEP_SEVERITY[step] ?? "WARNING",
      title: t("notif.consent.title", { bank: conn.bankName, when }),
      body: t("notif.consent.body", { date: expiryLabel }),
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
  t: Translator,
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
      title: t("notif.stale.title", { account: account.accountName }),
      body: t("notif.stale.body", { days }),
      dedupeKey: `no-transactions:${account.accountId}:${isoYearWeek(today)}`,
      metadata: { accountId: account.accountId, staleDays: String(days) },
    });
  }
  return specs;
}

export interface CashflowBreachInput {
  accountId: string;
  accountName: string;
  breachDate: string; // YYYY-MM-DD
  breachBalance: number;
  daysAway: number;
  /** Lowest projected balance over the horizon — sizes the top-up that fixes it. */
  minBalance: number;
}

/**
 * Day-level low-balance warning for one account: the daily cash-flow projection
 * says an upcoming charge (rent leaving before the salary lands) will push the
 * account under the user's threshold. Re-alerts weekly while the squeeze
 * persists — the key embeds the ISO week, not the shifting breach date.
 */
export function cashflowBreachNotifications(
  breaches: CashflowBreachInput[],
  threshold: number,
  today: string,
  currency: string,
  locale: string,
  t: Translator
): NotificationSpec[] {
  return breaches.map((b) => {
    const topUp = Math.ceil(threshold - b.minBalance);
    const when =
      b.daysAway === 1
        ? t("notif.cashflow.when.tomorrow")
        : t("notif.cashflow.when.inDays", {
            count: b.daysAway,
            date: b.breachDate,
          });
    return {
      type: "LOW_BALANCE_PROJECTED" as NotificationType,
      severity: (b.daysAway <= 7 ? "ALERT" : "WARNING") as NotificationSeverity,
      title: t("notif.cashflow.title", { account: b.accountName }),
      body: t("notif.cashflow.body", {
        balance: formatCurrency(b.breachBalance, currency, locale),
        when,
        topUp: formatCurrency(topUp, currency, locale),
      }),
      dedupeKey: `cashflow-low:${b.accountId}:${isoYearWeek(today)}`,
      metadata: {
        accountId: b.accountId,
        breachDate: b.breachDate,
        daysAway: String(b.daysAway),
      },
    };
  });
}

