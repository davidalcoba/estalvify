// Pure notification generators: given already-prepared data, return notification
// "specs" (what to create). Each spec carries a stable dedupeKey so generation is
// idempotent. No Prisma/network — unit-tested in isolation.

import type { NotificationType, NotificationSeverity } from "@/app/generated/prisma";
import type { BudgetRow } from "@/lib/budget/budget-progress";
import type { ProjectedBalance } from "@/lib/analytics/forecast";
import { firstBelowThreshold } from "@/lib/analytics/forecast";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { daysBetween } from "@/lib/recurring/detect";

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

export interface AmountChangeInput {
  merchantKey: string;
  displayName: string;
  latestAmount: number;
  latestDate: string; // YYYY-MM-DD
  baselineAmount: number;
  relativeChange: number; // signed fraction, +0.17 = up 17%
}

/**
 * A recurring charge came in noticeably above/below its usual amount (an
 * insurance premium silently raised, a promo price expiring). One alert per
 * deviating charge: the key embeds the charge date, so the same deviation never
 * re-alerts but next month's charge gets a fresh look.
 */
export function recurringAmountChangeNotifications(
  deviations: AmountChangeInput[],
  currency: string,
  locale: string
): NotificationSpec[] {
  return deviations.map((d) => {
    const pct = Math.round(Math.abs(d.relativeChange) * 100);
    const rose = d.relativeChange > 0;
    return {
      type: "RECURRING_AMOUNT_CHANGE" as NotificationType,
      severity: (rose ? "WARNING" : "INFO") as NotificationSeverity,
      title: `${d.displayName} ${rose ? "went up" : "went down"} ${pct}%`,
      body: `The latest charge was ${formatCurrency(d.latestAmount, currency, locale)}, against a usual ${formatCurrency(
        d.baselineAmount,
        currency,
        locale
      )}.`,
      dedupeKey: `recurring-amount:${d.merchantKey}:${d.latestDate}`,
      metadata: { merchantKey: d.merchantKey, date: d.latestDate },
    };
  });
}

export interface MissedSeriesInput {
  merchantKey: string;
  displayName: string;
  direction: "DEBIT" | "CREDIT";
  averageAmount: number;
  expectedDate: string; // YYYY-MM-DD
  daysOverdue: number;
}

/**
 * A confirmed series' expected charge never arrived — an unpaid bill, a
 * cancelled subscription still confirmed, or a sync quietly broken. One alert
 * per missed occurrence (the key embeds the expected date).
 */
export function missedRecurringNotifications(
  missed: MissedSeriesInput[],
  currency: string,
  locale: string
): NotificationSpec[] {
  return missed.map((m) => ({
    type: "RECURRING_MISSED" as NotificationType,
    severity: "WARNING" as NotificationSeverity,
    title: `Missing: ${m.displayName}`,
    body: `${
      m.direction === "CREDIT" ? "An expected income of" : "An expected charge of"
    } ${formatCurrency(m.averageAmount, currency, locale)} was due on ${m.expectedDate} and hasn't arrived (${m.daysOverdue} days). Check the bill — or the bank sync.`,
    dedupeKey: `recurring-missed:${m.merchantKey}:${m.expectedDate}`,
    metadata: { merchantKey: m.merchantKey, expectedDate: m.expectedDate },
  }));
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

export interface ExtraordinaryIncomeInput {
  merchantKey: string;
  displayName: string;
  latestAmount: number;
  latestDate: string; // YYYY-MM-DD
  baselineAmount: number;
  excess: number;
}

/**
 * An income arrived far above its usual amount — a bonus or annual variable
 * riding inside the salary row. The ask is explicit: split it and assign it,
 * because an unassigned windfall is absorbed by the month (April's 14.5k
 * changed that month's spending by nothing). One alert per arrival.
 */
export function extraordinaryIncomeNotifications(
  inputs: ExtraordinaryIncomeInput[],
  currency: string,
  locale: string
): NotificationSpec[] {
  return inputs.map((i) => ({
    type: "EXTRAORDINARY_INCOME" as NotificationType,
    severity: "INFO" as NotificationSeverity,
    title: `Extraordinary income: ${i.displayName}`,
    body: `${formatCurrency(i.latestAmount, currency, locale)} arrived against a usual ${formatCurrency(
      i.baselineAmount,
      currency,
      locale
    )} — about ${formatCurrency(i.excess, currency, locale)} extra. Split the transaction (base + extraordinary) and assign the excess to savings or a fund; money left unassigned gets spent by the month.`,
    dedupeKey: `extra-income:${i.merchantKey}:${i.latestDate}`,
    metadata: { merchantKey: i.merchantKey, date: i.latestDate },
  }));
}

export interface SavingsExecutionInput {
  savingsGoal: number; // resolved €, > 0 means a goal is set
  /** Whether an inbound transfer landed on the savings account this month. */
  executed: boolean;
  /** False when no savings account is designated — nothing to measure. */
  tracked: boolean;
  year: number;
  month: number;
  dayOfMonth: number;
  daysInMonth: number;
}

/** Days before month end at which an unexecuted savings transfer is flagged. */
export const SAVINGS_WARNING_WINDOW_DAYS = 5;

/**
 * The savings goal is set but no transfer into the savings account has landed
 * and the month is nearly over. The app cannot move money — the standing order
 * lives at the bank — so noticing it didn't run IS the feature. Once per month.
 */
export function savingsNotExecutedNotifications(
  input: SavingsExecutionInput,
  currency: string,
  locale: string
): NotificationSpec[] {
  if (input.savingsGoal <= 0 || !input.tracked || input.executed) return [];
  const daysLeft = input.daysInMonth - input.dayOfMonth;
  if (daysLeft > SAVINGS_WARNING_WINDOW_DAYS) return [];

  return [
    {
      type: "SAVINGS_NOT_EXECUTED" as NotificationType,
      severity: "WARNING" as NotificationSeverity,
      title: "This month's savings transfer hasn't run",
      body: `Your goal is ${formatCurrency(input.savingsGoal, currency, locale)} and no transfer into your savings account has arrived this month, with ${
        daysLeft === 0 ? "the month ending today" : `${daysLeft} days left`
      }. If it isn't automatic at the bank, make the move now — unmoved money gets spent.`,
      dedupeKey: `savings-missing:${input.year}-${input.month}`,
      metadata: { year: String(input.year), month: String(input.month) },
    },
  ];
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
  locale: string
): NotificationSpec[] {
  return breaches.map((b) => {
    const topUp = Math.ceil(threshold - b.minBalance);
    const when =
      b.daysAway === 1 ? "tomorrow" : `in ${b.daysAway} days (${b.breachDate})`;
    return {
      type: "LOW_BALANCE_PROJECTED" as NotificationType,
      severity: (b.daysAway <= 7 ? "ALERT" : "WARNING") as NotificationSeverity,
      title: `${b.accountName} won't cover upcoming charges`,
      body: `${b.accountName} is projected to fall to ${formatCurrency(
        b.breachBalance,
        currency,
        locale
      )} ${when}, below your ${formatCurrency(threshold, currency, locale)} threshold. A transfer of ${formatCurrency(
        topUp,
        currency,
        locale
      )} would keep it covered.`,
      dedupeKey: `cashflow-low:${b.accountId}:${isoYearWeek(today)}`,
      metadata: {
        accountId: b.accountId,
        breachDate: b.breachDate,
        daysAway: String(b.daysAway),
      },
    };
  });
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
