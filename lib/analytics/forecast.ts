// Pure forecasting helpers: project future spending and balances from historical
// averages. No Prisma/network — unit-tested in isolation.

import type { MonthBucket, MonthlyTotals } from "./trends";

const round = (n: number) => Math.round(n * 100) / 100;

export interface Averages {
  income: number;
  expenses: number;
  net: number;
}

/** Average income / expenses / net over the given (full) months. */
export function averageMonthly(rows: MonthlyTotals[]): Averages {
  if (rows.length === 0) return { income: 0, expenses: 0, net: 0 };
  const sum = rows.reduce(
    (acc, r) => ({ income: acc.income + r.income, expenses: acc.expenses + r.expenses }),
    { income: 0, expenses: 0 }
  );
  const income = round(sum.income / rows.length);
  const expenses = round(sum.expenses / rows.length);
  return { income, expenses, net: round(income - expenses) };
}

export interface ProjectedBalance extends MonthBucket {
  balance: number;
}

/**
 * Running projected balance for each future month: starting balance plus the
 * cumulative average monthly net.
 */
export function projectBalances(
  startingBalance: number,
  avgNet: number,
  buckets: MonthBucket[]
): ProjectedBalance[] {
  let balance = startingBalance;
  return buckets.map((bucket) => {
    balance = round(balance + avgNet);
    return { ...bucket, balance };
  });
}

/** Linear extrapolation of this month's spend from the month-to-date figure. */
export function projectMonthEndSpend(
  spentSoFar: number,
  dayOfMonth: number,
  daysInMonth: number
): number {
  if (dayOfMonth <= 0) return round(spentSoFar);
  return round((spentSoFar / dayOfMonth) * daysInMonth);
}

/** The first projected month (if any) whose balance falls below the threshold. */
export function firstBelowThreshold(
  projected: ProjectedBalance[],
  threshold: number
): ProjectedBalance | null {
  return projected.find((p) => p.balance < threshold) ?? null;
}
