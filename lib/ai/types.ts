// Provider-agnostic AI types. The financial summary is an ANONYMIZED aggregate —
// it must never contain IBANs, raw transaction descriptions, or merchant names.

export type RecommendationSeverity = "info" | "warning" | "alert";

export interface AiRecommendation {
  title: string;
  body: string;
  category?: string;
  severity: RecommendationSeverity;
}

export interface CategorySpendSummary {
  name: string;
  amount: number;
}

export interface BudgetLineSummary {
  name: string;
  planned: number;
  spent: number;
  status: "ok" | "warning" | "over";
}

/**
 * Anonymized snapshot of a user's finances passed to the AI. Amounts only, with
 * category names — no personally identifying transaction detail.
 */
export interface FinancialSummary {
  currency: string;
  monthLabel: string;
  income: number;
  expenses: number;
  net: number;
  avgMonthlyNet: number;
  netWorth: number;
  projectedBalanceEndOfHorizon: number | null;
  topCategories: CategorySpendSummary[];
  budget: BudgetLineSummary[];
  confirmedRecurringCount: number;
  monthlyRecurringExpenses: number;
}

export interface AiProvider {
  /** Generate recommendations from an anonymized financial summary. */
  generateRecommendations(summary: FinancialSummary): Promise<AiRecommendation[]>;
}

/** Thrown when the selected provider isn't configured (e.g. missing API key). */
export class AiNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiNotConfiguredError";
  }
}
