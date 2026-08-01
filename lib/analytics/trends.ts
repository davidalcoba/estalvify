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

export interface TrendRow {
  amount: number;
  direction: "DEBIT" | "CREDIT";
  valueDate: string; // ISO
}

export interface MonthlyTotals extends MonthBucket {
  income: number;
  expenses: number;
  net: number;
}

/**
 * Income (CREDIT) vs expenses (DEBIT) totals per month, restricted to the given
 * buckets (months with no activity come back as zeros so charts stay continuous).
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
    const date = new Date(row.valueDate);
    const key = `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}`;
    const entry = totals.get(key);
    if (!entry) continue;
    const amount = Math.abs(row.amount);
    if (!Number.isFinite(amount)) continue;
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
