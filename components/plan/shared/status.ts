import type { BudgetStatus } from "@/lib/budget/budget-progress";

// Semantic token classes per limit status (reuses the ok/warning/over model from
// budget-progress). Kept local to the Plan UI so it stays visually consistent.
export const statusIndicatorClass: Record<BudgetStatus, string> = {
  ok: "bg-success",
  warning: "bg-warning",
  over: "bg-destructive",
};

export const statusTextClass: Record<BudgetStatus, string> = {
  ok: "text-muted-foreground",
  warning: "text-warning",
  over: "text-destructive",
};
