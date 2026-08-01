import type { BudgetStatus } from "@/lib/budget/budget-progress";

// Semantic token classes per budget status. Kept in one place so the summary,
// rows and both device views stay visually consistent.

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
