import type { BudgetRow as BudgetRowVM } from "@/lib/budget/budget-progress";
import type { UnbudgetedRow } from "@/lib/budget/budget-dto";

// Shared prop shape for the desktop and mobile budget list views. The
// orchestrator owns state and passes identical data/handlers to both.
export interface BudgetListViewProps {
  rows: BudgetRowVM[];
  unbudgeted: UnbudgetedRow[];
  currency: string;
  locale: string;
  onEdit: (row: BudgetRowVM) => void;
  onRemove: (row: BudgetRowVM) => void;
  onBudgetUnbudgeted: (row: UnbudgetedRow) => void;
  disabled?: boolean;
}
