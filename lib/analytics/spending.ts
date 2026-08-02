// Pure spending-analytics helpers.
//
// Kept free of Prisma/network imports (type-only imports are erased at runtime)
// so they can be unit-tested in isolation, mirroring `lib/categorize.ts` and
// `lib/rules/rule-evaluator.ts`. The actual DB read happens in the page/actions
// using `buildMonthlySpendingWhere` + `aggregateSpendingByCategory`.

import type { Prisma } from "@/app/generated/prisma";

/**
 * UTC half-open date range for a given calendar month.
 * `valueDate` is stored as a date-only column, so anchoring on UTC midnight is
 * exact and avoids timezone drift.
 */
export function monthRange(year: number, month: number): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1)),
  };
}

/**
 * Prisma `where` selecting a user's real spending for a month: DEBIT (money-out)
 * transactions dated within the month whose approved category is an EXPENSE.
 *
 * The `kind` filter is what keeps a transfer between your own accounts out of
 * the totals. Filtering on `direction` alone counted the outgoing leg of every
 * savings transfer as spending — one 15.000 € move was landing in the month's
 * expenses and in the top-categories chart.
 */
export function buildMonthlySpendingWhere(
  userId: string,
  year: number,
  month: number
): Prisma.TransactionWhereInput {
  const { start, end } = monthRange(year, month);
  return {
    userId,
    direction: "DEBIT",
    valueDate: { gte: start, lt: end },
    categorization: { is: { status: "APPROVED", category: { is: { kind: "EXPENSE" } } } },
  };
}

interface SpendingRow {
  amount: { toString(): string };
  categorization: { categoryId: string } | null;
}

/**
 * Sum transaction amounts by their approved category. Rows without a
 * categorization or with a non-numeric amount are ignored.
 */
export function aggregateSpendingByCategory(
  rows: SpendingRow[]
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const row of rows) {
    const categoryId = row.categorization?.categoryId;
    if (!categoryId) continue;
    const amount = Number(row.amount.toString());
    if (!Number.isFinite(amount)) continue;
    totals[categoryId] = (totals[categoryId] ?? 0) + amount;
  }
  return totals;
}

/**
 * The current calendar year/month in a given IANA timezone. `now` is injectable
 * for deterministic tests.
 */
export function currentYearMonth(
  timezone: string,
  now: Date = new Date()
): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  return { year, month };
}
