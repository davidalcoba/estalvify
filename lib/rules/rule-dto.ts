// Types and DTOs for transaction categorization rules

export type RuleConditionField =
  | "description"
  | "creditorName"
  | "debtorName"
  | "remittanceInfo"
  | "amount"
  | "direction";

export type RuleConditionOperator =
  | "contains"
  | "equals"
  | "startsWith"
  | "endsWith"
  | "greaterThan"
  | "lessThan";

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
  description: "Descripción",
  creditorName: "Acreedor",
  debtorName: "Deudor",
  remittanceInfo: "Referencia",
  amount: "Importe",
  direction: "Dirección",
};

export const OPERATOR_LABELS: Record<RuleConditionOperator, string> = {
  contains: "contiene",
  equals: "es igual a",
  startsWith: "empieza por",
  endsWith: "termina en",
  greaterThan: "mayor que",
  lessThan: "menor que",
};

// Which operators are valid for each field type
export const TEXT_FIELDS: RuleConditionField[] = [
  "description",
  "creditorName",
  "debtorName",
  "remittanceInfo",
];

export const NUMERIC_FIELDS: RuleConditionField[] = ["amount"];
export const ENUM_FIELDS: RuleConditionField[] = ["direction"];

export const TEXT_OPERATORS: RuleConditionOperator[] = [
  "contains",
  "equals",
  "startsWith",
  "endsWith",
];

export const NUMERIC_OPERATORS: RuleConditionOperator[] = [
  "equals",
  "greaterThan",
  "lessThan",
];

export const DIRECTION_OPERATORS: RuleConditionOperator[] = ["equals"];

export function getOperatorsForField(
  field: RuleConditionField
): RuleConditionOperator[] {
  if (NUMERIC_FIELDS.includes(field)) return NUMERIC_OPERATORS;
  if (ENUM_FIELDS.includes(field)) return DIRECTION_OPERATORS;
  return TEXT_OPERATORS;
}

export function getDefaultOperator(field: RuleConditionField): RuleConditionOperator {
  if (NUMERIC_FIELDS.includes(field)) return "equals";
  if (ENUM_FIELDS.includes(field)) return "equals";
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
