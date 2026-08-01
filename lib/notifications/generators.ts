// Pure notification generators: given already-prepared data, return notification
// "specs" (what to create). Each spec carries a stable dedupeKey so generation is
// idempotent. No Prisma/network — unit-tested in isolation.

import type { NotificationType, NotificationSeverity } from "@/app/generated/prisma";
import type { BudgetRow } from "@/lib/budget/budget-progress";
import { formatCurrency } from "@/lib/formatters";
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
