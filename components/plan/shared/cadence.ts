import type { PlanCadence } from "@/lib/plan/plan-item";

// Display labels for plan cadences, kept in one place so the dialog, rows and
// summary stay consistent.
export const cadenceLabel: Record<PlanCadence, string> = {
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  YEARLY: "Yearly",
  ONE_OFF: "One-off",
};

export const CADENCE_OPTIONS = (Object.keys(cadenceLabel) as PlanCadence[]).map((value) => ({
  value,
  label: cadenceLabel[value],
}));

/** Cadences that support an optional day-of-month anchor. */
export const DAY_ANCHOR_CADENCES: PlanCadence[] = ["MONTHLY", "QUARTERLY", "YEARLY"];
