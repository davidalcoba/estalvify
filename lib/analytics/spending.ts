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
  month: number,
  /** Restrict to one bank account; omitted or empty means all of them. */
  bankAccountId?: string
): Prisma.TransactionWhereInput {
  const { start, end } = monthRange(year, month);
  return {
    userId,
    direction: "DEBIT",
    valueDate: { gte: start, lt: end },
    categorization: { is: { status: "APPROVED", category: { is: { kind: "EXPENSE" } } } },
    ...(bankAccountId ? { bankAccountId } : {}),
  };
}

interface SpendingRow {
  amount: { toString(): string };
  categorization: { categoryId: string } | null;
  /**
   * User-authored split lines. When present they are the truth: each line
   * counts under its own category and an unassigned line falls back to the
   * parent's category, so a split cash withdrawal stops being one opaque
   * "Cash" lump. Callers that don't fetch splits keep the old behaviour.
   */
  splits?: { amount: { toString(): string }; categoryId: string | null }[];
}

/**
 * Sum transaction amounts by their approved category. Rows without a
 * categorization or with a non-numeric amount are ignored. A row with split
 * lines contributes its lines instead of itself (never both).
 */
export function aggregateSpendingByCategory(
  rows: SpendingRow[]
): Record<string, number> {
  const totals: Record<string, number> = {};
  const add = (categoryId: string | null | undefined, amount: number) => {
    if (!categoryId || !Number.isFinite(amount)) return;
    totals[categoryId] = (totals[categoryId] ?? 0) + amount;
  };
  for (const row of rows) {
    const parentCategoryId = row.categorization?.categoryId ?? null;
    if (row.splits && row.splits.length > 0) {
      for (const split of row.splits) {
        add(split.categoryId ?? parentCategoryId, Number(split.amount.toString()));
      }
    } else {
      add(parentCategoryId, Number(row.amount.toString()));
    }
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
