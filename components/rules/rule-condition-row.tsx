"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  type RuleCondition,
  type RuleConditionField,
  type RuleConditionOperator,
  FIELD_LABELS,
  OPERATOR_LABELS,
  getOperatorsForField,
  getDefaultOperator,
} from "@/lib/rules/rule-dto";

const ALL_FIELDS: RuleConditionField[] = [
  "description",
  "creditorName",
  "debtorName",
];

interface RuleConditionRowProps {
  condition: RuleCondition;
  index: number;
  onChange: (index: number, condition: RuleCondition) => void;
  onRemove: (index: number) => void;
  canRemove: boolean;
}

export function RuleConditionRow({
  condition,
  index,
  onChange,
  onRemove,
  canRemove,
}: RuleConditionRowProps) {
  function handleFieldChange(field: RuleConditionField) {
    const operator = getDefaultOperator(field);
    const value = field === "direction" ? "DEBIT" : condition.value;
    onChange(index, { field, operator, value });
  }

  function handleOperatorChange(operator: RuleConditionOperator) {
    onChange(index, { ...condition, operator });
  }

  function handleValueChange(value: string) {
    onChange(index, { ...condition, value });
  }

  const operators = getOperatorsForField(condition.field);

  return (
    <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
      <select
        value={condition.field}
        onChange={(e) => handleFieldChange(e.target.value as RuleConditionField)}
        className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 min-w-[130px] flex-1 sm:flex-none"
      >
        {ALL_FIELDS.map((f) => (
          <option key={f} value={f}>
            {FIELD_LABELS[f]}
          </option>
        ))}
      </select>

      <select
        value={condition.operator}
        onChange={(e) => handleOperatorChange(e.target.value as RuleConditionOperator)}
        className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 min-w-[130px] flex-1 sm:flex-none"
      >
        {operators.map((op) => (
          <option key={op} value={op}>
            {OPERATOR_LABELS[op]}
          </option>
        ))}
      </select>

      <input
        type="text"
        value={condition.value}
        onChange={(e) => handleValueChange(e.target.value)}
        placeholder="Value..."
        className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 flex-1 min-w-[140px]"
      />

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => onRemove(index)}
        disabled={!canRemove}
        className="shrink-0 h-9 w-9 text-muted-foreground hover:text-destructive"
        aria-label="Remove condition"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
