// Budget domain DTOs — plain objects safe to pass across server→client boundary

export type TargetType = "MONTHLY" | "YEARLY" | "SPECIFIC_MONTHS";

export interface BudgetTargetDTO {
  id: string;
  targetType: TargetType;
  amount: number;
  currency: string;
  dueMonth: number | null;
  specificMonths: number[] | null;
  /** How much to assign this month to meet the target (computed). */
  suggestedAmount: number;
}

export interface BudgetCategoryDTO {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  categoryIcon: string | null;
  parentId: string | null;
  parentName: string | null;
  /** true = income category; transactions feed ReadyToAssign, not activity. */
  inflow: boolean;
  /** Amount assigned in the viewed month. */
  assigned: number;
  /** Net activity in the viewed month (positive = spending). Inflow categories always 0. */
  activity: number;
  /** Cumulative available = all-time assigned − all-time activity. Inflow categories always 0. */
  available: number;
  target: BudgetTargetDTO | null;
}

export interface BudgetMonthDTO {
  year: number;
  month: number;
  /** Total inflows minus total assigned across all months. */
  readyToAssign: number;
  currency: string;
  categoryGroups: BudgetCategoryGroupDTO[];
}

export interface BudgetCategoryGroupDTO {
  groupId: string | null;
  groupName: string;
  groupColor: string;
  /** Sum of assigned amounts for this group in the viewed month. */
  assignedTotal: number;
  /** Sum of activity amounts for this group in the viewed month. */
  activityTotal: number;
  /** Sum of available amounts for this group. */
  availableTotal: number;
  categories: BudgetCategoryDTO[];
}
