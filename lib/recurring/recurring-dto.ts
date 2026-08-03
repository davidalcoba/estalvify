// Merges live detection candidates with the user's stored decisions, and derives
// the monthly-cost summary. Pure and serializable — safe to hand to client
// components and unit-tested in isolation.

import type { RecurringCandidate, Cadence } from "./detect";

export type RecurringDecision = "SUGGESTED" | "CONFIRMED" | "IGNORED";

export interface StoredRecurring {
  merchantKey: string;
  status: "CONFIRMED" | "IGNORED";
}

export interface RecurringItem extends RecurringCandidate {
  status: RecurringDecision;
  /** A Plan item is linked to this series (confirming adds one automatically). */
  inPlan: boolean;
}

/**
 * Overlay stored confirm/ignore decisions onto detected candidates by key, plus
 * which series already mirror a Plan item (`plannedKeys` = the linked plan items'
 * `recurringMerchantKey`s).
 */
export function mergeRecurring(
  candidates: RecurringCandidate[],
  stored: StoredRecurring[],
  plannedKeys: string[] = []
): RecurringItem[] {
  const byKey = new Map(stored.map((s) => [s.merchantKey, s.status]));
  const planned = new Set(plannedKeys);
  return candidates.map((candidate) => ({
    ...candidate,
    status: byKey.get(candidate.merchantKey) ?? "SUGGESTED",
    inPlan: planned.has(candidate.merchantKey),
  }));
}

/** Normalize an amount for a cadence to a per-month figure. */
export function monthlyEquivalent(amount: number, cadence: Cadence): number {
  switch (cadence) {
    case "WEEKLY":
      return (amount * 52) / 12;
    case "MONTHLY":
      return amount;
    case "QUARTERLY":
      return amount / 3;
    case "YEARLY":
      return amount / 12;
  }
}

export interface RecurringSummary {
  monthlyExpenses: number;
  monthlyIncome: number;
  confirmedCount: number;
  suggestedCount: number;
}

/**
 * Summary over confirmed series (what the user acknowledged as recurring), plus
 * how many suggestions are still awaiting review. IGNORED items are excluded.
 */
export function summarizeRecurring(items: RecurringItem[]): RecurringSummary {
  let monthlyExpenses = 0;
  let monthlyIncome = 0;
  let confirmedCount = 0;
  let suggestedCount = 0;

  for (const item of items) {
    if (item.status === "SUGGESTED") {
      suggestedCount += 1;
      continue;
    }
    if (item.status !== "CONFIRMED") continue;

    confirmedCount += 1;
    const monthly = monthlyEquivalent(item.averageAmount, item.cadence);
    if (item.direction === "DEBIT") monthlyExpenses += monthly;
    else monthlyIncome += monthly;
  }

  return {
    monthlyExpenses: Math.round(monthlyExpenses * 100) / 100,
    monthlyIncome: Math.round(monthlyIncome * 100) / 100,
    confirmedCount,
    suggestedCount,
  };
}
