// Pure sinking-fund math. A fund is internal accounting over the savings
// balance — no real sub-account exists, no cron writes anything. The accrued
// amount is derived from the fund's own definition, so it is always consistent
// and needs no maintenance job.

export interface SinkingFundInput {
  targetAmount: number;
  monthlyContribution: number;
  /** ISO date "YYYY-MM-DD": contributions count from this month onward. */
  startDate: string;
  initialAmount: number;
}

export interface YearMonth {
  year: number;
  month: number; // 1–12
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Whole months from the start date's month to `ref`, inclusive of both. */
export function monthsElapsed(startDate: string, ref: YearMonth): number {
  const m = /^(\d{4})-(\d{2})/.exec(startDate);
  if (!m) return 0;
  const startYear = Number(m[1]);
  const startMonth = Number(m[2]);
  return (ref.year - startYear) * 12 + (ref.month - startMonth) + 1;
}

/**
 * What the fund has accrued as of `ref`: the initial amount plus one
 * contribution per elapsed month, capped at the target. A fund created this
 * month has already accrued this month's contribution — it is a commitment,
 * counted like the rent.
 */
export function accruedAmount(fund: SinkingFundInput, ref: YearMonth): number {
  const months = Math.max(0, monthsElapsed(fund.startDate, ref));
  const accrued = fund.initialAmount + fund.monthlyContribution * months;
  return round(Math.min(fund.targetAmount, Math.max(0, accrued)));
}

/** Whether the fund has reached its target by `ref` (contributions stop). */
export function isFunded(fund: SinkingFundInput, ref: YearMonth): boolean {
  return accruedAmount(fund, ref) >= fund.targetAmount;
}

/**
 * The month's total sinking contribution: active funds still short of their
 * target. This joins the commitments block next to the savings goal.
 */
export function totalMonthlyContribution(
  funds: SinkingFundInput[],
  ref: YearMonth
): number {
  let total = 0;
  for (const fund of funds) {
    if (fund.monthlyContribution <= 0) continue;
    // A fund that reached its target WITHOUT this month's contribution no
    // longer needs one; checking last month avoids charging the final month
    // twice.
    const before = accruedAmount(fund, previousMonth(ref));
    if (before >= fund.targetAmount) continue;
    total += fund.monthlyContribution;
  }
  return round(total);
}

function previousMonth(ref: YearMonth): YearMonth {
  return ref.month === 1
    ? { year: ref.year - 1, month: 12 }
    : { year: ref.year, month: ref.month - 1 };
}

/**
 * Contribution that reaches `targetAmount` by `targetDate` from `ref`,
 * given what is already accrued. Null without a target date or when the date
 * is not ahead. The add-fund dialog uses it as the suggested amount.
 */
export function suggestedContribution(
  targetAmount: number,
  alreadyAccrued: number,
  targetDate: string,
  ref: YearMonth
): number | null {
  const m = /^(\d{4})-(\d{2})/.exec(targetDate);
  if (!m) return null;
  const monthsLeft =
    (Number(m[1]) - ref.year) * 12 + (Number(m[2]) - ref.month);
  if (monthsLeft <= 0) return null;
  const remaining = Math.max(0, targetAmount - alreadyAccrued);
  return round(remaining / monthsLeft);
}
