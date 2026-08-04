// Pure household helpers. The consolidated view is the default everywhere;
// these exist for the one number a household should know about itself: how
// much of the income rides on a single person.

export interface HolderIncome {
  holder: string;
  income: number;
}

export interface IncomeConcentration {
  holder: string;
  /** Share of total income, 0–1. */
  share: number;
}

/**
 * The top holder's share of household income. Null when there's nothing to
 * compare — fewer than two holders with income, or no income at all — because
 * "100% of income depends on the only earner listed" is noise, not insight.
 */
export function incomeConcentration(
  entries: HolderIncome[]
): IncomeConcentration | null {
  const byHolder = new Map<string, number>();
  for (const entry of entries) {
    if (!entry.holder || entry.income <= 0) continue;
    byHolder.set(entry.holder, (byHolder.get(entry.holder) ?? 0) + entry.income);
  }
  if (byHolder.size < 2) return null;
  const total = [...byHolder.values()].reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  let top: { holder: string; income: number } | null = null;
  for (const [holder, income] of byHolder) {
    if (!top || income > top.income) top = { holder, income };
  }
  return {
    holder: top!.holder,
    share: Math.round((top!.income / total) * 1000) / 1000,
  };
}
