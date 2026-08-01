"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SimpleSelect } from "@/components/ui/simple-select";
import {
  type RuleCondition,
  type RuleConditionField,
  type RuleConditionOperator,
  FIELD_LABELS,
  OPERATOR_LABELS,
  getOperatorsForField,
  getDefaultOperator,
} from "@/lib/rules/rule-dto";

const ALL_FIELDS: RuleConditionField[] = ["description", "remittanceInfo"];

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
    onChange(index, { field, operator: getDefaultOperator(field), value: condition.value });
  }

  function handleOperatorChange(operator: RuleConditionOperator) {
    onChange(index, { ...condition, operator });
  }

  function handleValueChange(value: string) {
    onChange(index, { ...condition, value });
  }

  const operators = getOperatorsForField(condition.field);

  return (
    // Mobile: 2-column grid (field+operator row 1, value full-width row 2)
    // Desktop (sm+): single flex row
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-nowrap sm:items-center sm:gap-2">
      <SimpleSelect
        value={condition.field}
        onValueChange={(v) => handleFieldChange(v as RuleConditionField)}
        ariaLabel="Condition field"
        className="col-span-1 w-full"
        options={ALL_FIELDS.map((f) => ({ value: f, label: FIELD_LABELS[f] }))}
      />

      <SimpleSelect
        value={condition.operator}
        onValueChange={(v) => handleOperatorChange(v as RuleConditionOperator)}
        ariaLabel="Condition operator"
        className="col-span-1 w-full"
        options={operators.map((op) => ({ value: op, label: OPERATOR_LABELS[op] }))}
      />

      <Input
        type="text"
        value={condition.value}
        onChange={(e) => handleValueChange(e.target.value)}
        placeholder="Value..."
        className="col-span-2 sm:col-span-1 sm:flex-1"
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
