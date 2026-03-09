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
  "remittanceInfo",
  "amount",
  "direction",
];

interface RuleConditionRowProps {
  condition: RuleCondition;
  index: number;
  onChange: (index: number, condition: RuleCondition) => void;
  onRemove: (index: number) => void;
  canRemove: boolean;
  allowedFields?: RuleConditionField[];
}

export function RuleConditionRow({
  condition,
  index,
  onChange,
  onRemove,
  canRemove,
  allowedFields,
}: RuleConditionRowProps) {
  function handleFieldChange(field: RuleConditionField) {
    onChange(index, { field, operator: getDefaultOperator(field), value: condition.value });
  }

  function handleOperatorChange(operator: RuleConditionOperator) {
    onChange(index, { ...condition, operator });
  }

  function handleValueChange(value: string) {
    onChange(index, { ...condition, value });
  }

  const fields = allowedFields ?? ALL_FIELDS;
  const operators = getOperatorsForField(condition.field);

  const selectCls = "h-9 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";
  const inputCls = "h-9 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";

  return (
    // Mobile: 2-column grid (field+operator row 1, value full-width row 2)
    // Desktop (sm+): single flex row
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-nowrap sm:items-center sm:gap-2">
      <select
        value={condition.field}
        onChange={(e) => handleFieldChange(e.target.value as RuleConditionField)}
        className={`${selectCls} col-span-1`}
      >
        {fields.map((f) => (
          <option key={f} value={f}>
            {FIELD_LABELS[f]}
          </option>
        ))}
      </select>

      <select
        value={condition.operator}
        onChange={(e) => handleOperatorChange(e.target.value as RuleConditionOperator)}
        className={`${selectCls} col-span-1`}
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
        className={`${inputCls} col-span-2 sm:col-span-1 sm:flex-1`}
      />

      {canRemove && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onRemove(index)}
          className="col-span-2 justify-self-end h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
          aria-label="Remove condition"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
