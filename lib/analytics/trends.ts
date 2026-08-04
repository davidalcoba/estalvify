// Pure trend/aggregation helpers for the dashboard and reports. No Prisma/network
// — unit-tested in isolation; pages fetch rows and pass them in.

export interface MonthBucket {
  year: number;
  month: number; // 1–12
}

/** The trailing `n` months ending at (year, month), oldest first. */
export function lastNMonths(year: number, month: number, n: number): MonthBucket[] {
  const buckets: MonthBucket[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const zeroBased = month - 1 - i;
    buckets.push({
      year: year + Math.floor(zeroBased / 12),
      month: ((zeroBased % 12) + 12) % 12 + 1,
    });
  }
  return buckets;
}

/** The `n` months AFTER (year, month), soonest first. */
export function forwardMonths(year: number, month: number, n: number): MonthBucket[] {
  const buckets: MonthBucket[] = [];
  for (let k = 1; k <= n; k++) {
    const zeroBased = month - 1 + k;
    buckets.push({
      year: year + Math.floor(zeroBased / 12),
      month: ((zeroBased % 12) + 12) % 12 + 1,
    });
  }
  return buckets;
}

export interface TrendRow {
  amount: number;
  direction: "DEBIT" | "CREDIT";
  valueDate: string; // ISO
  /**
   * Kind of the row's category, or null when it has none. Null keeps counting by
   * direction: dropping uncategorized rows would quietly understate every month,
   * which is worse than the transfer contamination this field exists to fix.
   */
  categoryKind?: "EXPENSE" | "INCOME" | "TRANSFER" | null;
  /**
   * Total of the row's split lines marked extraordinary. Subtracted before
   * bucketing, so the April bonus riding inside the salary row stops inflating
   * income averages (a 6-month mean 2.4k€/month above the real fixed income).
   */
  extraordinaryAmount?: number;
}

export interface MonthlyTotals extends MonthBucket {
  income: number;
  expenses: number;
  net: number;
}

/**
 * Income (CREDIT) vs expenses (DEBIT) totals per month, restricted to the given
 * buckets (months with no activity come back as zeros so charts stay continuous).
 *
 * TRANSFER rows are skipped entirely. Splitting on `direction` alone counted a
 * movement between the user's own accounts as income AND as an expense in the
 * same month — a 15.000 € transfer showed up as 15.000 on both sides.
 */
export function monthlyIncomeExpenses(
  rows: TrendRow[],
  buckets: MonthBucket[]
): MonthlyTotals[] {
  const totals = new Map<string, { income: number; expenses: number }>();
  for (const bucket of buckets) {
    totals.set(`${bucket.year}-${bucket.month}`, { income: 0, expenses: 0 });
  }

  for (const row of rows) {
    if (row.categoryKind === "TRANSFER") continue;
    const date = new Date(row.valueDate);
    const key = `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}`;
    const entry = totals.get(key);
    if (!entry) continue;
    const gross = Math.abs(row.amount);
    if (!Number.isFinite(gross)) continue;
    const amount = Math.max(0, gross - Math.abs(row.extraordinaryAmount ?? 0));
    if (row.direction === "CREDIT") entry.income += amount;
    else entry.expenses += amount;
  }

  const round = (n: number) => Math.round(n * 100) / 100;
  return buckets.map((bucket) => {
    const entry = totals.get(`${bucket.year}-${bucket.month}`)!;
    const income = round(entry.income);
    const expenses = round(entry.expenses);
    return { ...bucket, income, expenses, net: round(income - expenses) };
  });
}

export interface CategoryMeta {
  id: string;
  name: string;
  color: string;
}

export interface CategorySpend {
  categoryId: string;
  name: string;
  color: string;
  amount: number;
}

/** Categories with the most spending, richest first, capped at `limit`. */
export function topCategories(
  spendingByCategory: Record<string, number>,
  categories: CategoryMeta[],
  limit = 6
): CategorySpend[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  return Object.entries(spendingByCategory)
    .filter(([, amount]) => amount > 0)
    .map(([categoryId, amount]) => {
      const meta = byId.get(categoryId);
      return {
        categoryId,
        name: meta?.name ?? "Uncategorized",
        color: meta?.color ?? "#6366f1",
        amount: Math.round(amount * 100) / 100,
      };
    })
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}
