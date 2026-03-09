// Types and DTOs for transaction categorization rules

export type RuleConditionField = "description" | "remittanceInfo";

export type RuleConditionOperator =
  | "contains"
  | "equals"
  | "startsWith"
  | "endsWith";

export interface RuleCondition {
  field: RuleConditionField;
  operator: RuleConditionOperator;
  value: string;
}

export interface CategoryRuleDTO {
  id: string;
  name: string;
  conditions: RuleCondition[];
  sourceCategoryId: string | null;
  sourceCategoryName: string | null;
  sourceCategoryColor: string | null;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  isActive: boolean;
  priority: number;
  createdAt: string;
}

// Labels for UI rendering

export const FIELD_LABELS: Record<RuleConditionField, string> = {
  description: "Description",
  remittanceInfo: "Reference",
};

export const OPERATOR_LABELS: Record<RuleConditionOperator, string> = {
  contains: "contains",
  equals: "equals",
  startsWith: "starts with",
  endsWith: "ends with",
};

export const TEXT_OPERATORS: RuleConditionOperator[] = [
  "contains",
  "equals",
  "startsWith",
  "endsWith",
];

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getOperatorsForField(_field: RuleConditionField): RuleConditionOperator[] {
  return TEXT_OPERATORS;
}

export function getDefaultOperator(_field: RuleConditionField): RuleConditionOperator {
  return "contains";
}

export function toCategoryRuleDTO(rule: {
  id: string;
  name: string;
  conditions: unknown;
  sourceCategoryId: string | null;
  categoryId: string;
  isActive: boolean;
  priority: number;
  createdAt: Date;
  category: { name: string; color: string };
  sourceCategory: { name: string; color: string } | null;
}): CategoryRuleDTO {
  return {
    id: rule.id,
    name: rule.name,
    conditions: rule.conditions as RuleCondition[],
    sourceCategoryId: rule.sourceCategoryId,
    sourceCategoryName: rule.sourceCategory?.name ?? null,
    sourceCategoryColor: rule.sourceCategory?.color ?? null,
    categoryId: rule.categoryId,
    categoryName: rule.category.name,
    categoryColor: rule.category.color,
    isActive: rule.isActive,
    priority: rule.priority,
    createdAt: rule.createdAt.toISOString(),
  };
}
