// Pure helpers to build the anonymized FinancialSummary and render it as prompt
// text. No Prisma/network — unit-tested. Deliberately excludes IBANs, raw
// descriptions, and merchant names; only category names + aggregate amounts.

import { formatCurrency } from "@/lib/formatters";
import type {
  FinancialSummary,
  BudgetLineSummary,
  CategorySpendSummary,
} from "./types";

export interface SummaryInputs {
  currency: string;
  locale: string;
  monthLabel: string;
  income: number;
  expenses: number;
  avgMonthlyNet: number;
  netWorth: number;
  projectedBalanceEndOfHorizon: number | null;
  topCategories: CategorySpendSummary[];
  budget: BudgetLineSummary[];
  confirmedRecurringCount: number;
  monthlyRecurringExpenses: number;
}

const round = (n: number) => Math.round(n * 100) / 100;

export function buildFinancialSummary(inputs: SummaryInputs): FinancialSummary {
  return {
    currency: inputs.currency,
    monthLabel: inputs.monthLabel,
    income: round(inputs.income),
    expenses: round(inputs.expenses),
    net: round(inputs.income - inputs.expenses),
    avgMonthlyNet: round(inputs.avgMonthlyNet),
    netWorth: round(inputs.netWorth),
    projectedBalanceEndOfHorizon:
      inputs.projectedBalanceEndOfHorizon === null
        ? null
        : round(inputs.projectedBalanceEndOfHorizon),
    topCategories: inputs.topCategories.map((c) => ({
      name: c.name,
      amount: round(c.amount),
    })),
    budget: inputs.budget,
    confirmedRecurringCount: inputs.confirmedRecurringCount,
    monthlyRecurringExpenses: round(inputs.monthlyRecurringExpenses),
  };
}

/** Render the summary as compact prompt text with formatted amounts. */
export function summaryToPrompt(summary: FinancialSummary, locale: string): string {
  const money = (n: number) => formatCurrency(n, summary.currency, locale);
  const lines: string[] = [];

  lines.push(`Month: ${summary.monthLabel}`);
  lines.push(`Income this month: ${money(summary.income)}`);
  lines.push(`Expenses this month: ${money(summary.expenses)}`);
  lines.push(`Net this month: ${money(summary.net)}`);
  lines.push(`Average monthly net (last 6 months): ${money(summary.avgMonthlyNet)}`);
  lines.push(`Net worth: ${money(summary.netWorth)}`);
  if (summary.projectedBalanceEndOfHorizon !== null) {
    lines.push(
      `Projected balance in 6 months: ${money(summary.projectedBalanceEndOfHorizon)}`
    );
  }
  lines.push(
    `Confirmed recurring payments: ${summary.confirmedRecurringCount} (~${money(
      summary.monthlyRecurringExpenses
    )}/month)`
  );

  if (summary.topCategories.length > 0) {
    lines.push("Top spending categories this month:");
    for (const c of summary.topCategories) {
      lines.push(`  - ${c.name}: ${money(c.amount)}`);
    }
  }

  if (summary.budget.length > 0) {
    lines.push("Budget vs actual this month:");
    for (const b of summary.budget) {
      lines.push(
        `  - ${b.name}: spent ${money(b.spent)} of ${money(b.planned)} (${b.status})`
      );
    }
  }

  return lines.join("\n");
}

export const RECOMMENDATIONS_SYSTEM_PROMPT = [
  "You are a concise, practical personal-finance assistant.",
  "You are given an anonymized monthly summary of a user's finances (aggregate amounts and category names only).",
  "Produce 3 to 5 specific, actionable recommendations tailored to the numbers.",
  "Be concrete and reference the figures. Avoid generic advice and disclaimers.",
  "Each recommendation has a short title, a one- to two-sentence body, an optional category name it relates to, and a severity of 'info', 'warning', or 'alert'.",
  "Use 'alert' only for genuinely urgent issues (e.g. projected negative balance, badly over budget).",
].join(" ");
