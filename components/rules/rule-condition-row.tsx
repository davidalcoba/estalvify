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
  getDefaultValue,
  isOperatorValidForField,
} from "@/lib/rules/rule-dto";

const ALL_FIELDS: RuleConditionField[] = [
  "any",
  "description",
  "remittanceInfo",
  "amount",
  "direction",
  "account",
];

const DIRECTIONS = [
  { value: "DEBIT", label: "Money out" },
  { value: "CREDIT", label: "Money in" },
];

interface RuleConditionRowProps {
  condition: RuleCondition;
  index: number;
  onChange: (index: number, condition: RuleCondition) => void;
  onRemove: (index: number) => void;
  canRemove: boolean;
}

function toRange(value: RuleCondition["value"]): [string, string] {
  if (Array.isArray(value)) return [String(value[0] ?? ""), String(value[1] ?? "")];
  return ["", ""];
}

export function RuleConditionRow({
  condition,
  index,
  onChange,
  onRemove,
  canRemove,
}: RuleConditionRowProps) {
  function handleFieldChange(field: RuleConditionField) {
    // Switching field type can invalidate both the operator and the value
    // (text → amount range), so reset whatever no longer fits.
    const operator = isOperatorValidForField(field, condition.operator)
      ? condition.operator
      : getDefaultOperator(field);
    const keepsValue =
      isOperatorValidForField(field, condition.operator) &&
      (field === "amount") === (condition.field === "amount") &&
      (field === "direction") === (condition.field === "direction");

    onChange(index, {
      ...condition,
      field,
      operator,
      value: keepsValue ? condition.value : getDefaultValue(field),
    });
  }

  function handleOperatorChange(operator: RuleConditionOperator) {
    const wasRange = condition.operator === "between";
    const isRange = operator === "between";
    onChange(index, {
      ...condition,
      operator,
      value: wasRange === isRange ? condition.value : isRange ? [0, 0] : "",
    });
  }

  function handleValueChange(value: RuleCondition["value"]) {
    onChange(index, { ...condition, value });
  }

  function handleRangeChange(position: 0 | 1, raw: string) {
    const range = toRange(condition.value);
    range[position] = raw;
    handleValueChange([Number(range[0]) || 0, Number(range[1]) || 0]);
  }

  const operators = getOperatorsForField(condition.field);
  const [rangeLow, rangeHigh] = toRange(condition.value);
  const scalarValue = Array.isArray(condition.value) ? "" : String(condition.value);

  return (
    // Mobile: 2-column grid (field+operator row 1, value full-width row 2)
    // Desktop (sm+): single flex row. The selects get a fixed width there and
    // stop shrinking — with `w-full` they each claimed the whole row as their
    // flex basis, shrank proportionally and left the value input at ~0, so a
    // saved value was invisible in the narrower edit dialog.
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-nowrap sm:items-center sm:gap-2">
      <SimpleSelect
        value={condition.field}
        onValueChange={(v) => handleFieldChange(v as RuleConditionField)}
        ariaLabel="Condition field"
        className="col-span-1 w-full sm:w-[140px] sm:shrink-0"
        options={ALL_FIELDS.map((f) => ({ value: f, label: FIELD_LABELS[f] }))}
      />

      <SimpleSelect
        value={condition.negate ? "not" : "is"}
        onValueChange={(v) => onChange(index, { ...condition, negate: v === "not" })}
        ariaLabel="Condition negation"
        className="col-span-1 w-full sm:w-[104px] sm:shrink-0"
        options={[
          { value: "is", label: "does" },
          { value: "not", label: "does not" },
        ]}
      />

      <SimpleSelect
        value={condition.operator}
        onValueChange={(v) => handleOperatorChange(v as RuleConditionOperator)}
        ariaLabel="Condition operator"
        className="col-span-1 w-full sm:w-[148px] sm:shrink-0"
        options={operators.map((op) => ({ value: op, label: OPERATOR_LABELS[op] }))}
      />

      {condition.field === "direction" ? (
        <SimpleSelect
          value={scalarValue || "DEBIT"}
          onValueChange={handleValueChange}
          ariaLabel="Direction"
          className="col-span-2 w-full sm:col-span-1 sm:flex-1"
          options={DIRECTIONS}
        />
      ) : condition.operator === "between" ? (
        <div className="col-span-2 flex items-center gap-2 sm:col-span-1 sm:flex-1">
          <Input
            type="number"
            step="0.01"
            value={rangeLow}
            onChange={(e) => handleRangeChange(0, e.target.value)}
            placeholder="Min"
            aria-label="Minimum amount"
            className="flex-1"
          />
          <span className="text-sm text-muted-foreground">and</span>
          <Input
            type="number"
            step="0.01"
            value={rangeHigh}
            onChange={(e) => handleRangeChange(1, e.target.value)}
            placeholder="Max"
            aria-label="Maximum amount"
            className="flex-1"
          />
        </div>
      ) : condition.field === "amount" ? (
        <Input
          type="number"
          step="0.01"
          value={scalarValue}
          onChange={(e) => handleValueChange(e.target.value)}
          placeholder="Amount..."
          aria-label="Amount"
          className="col-span-2 sm:col-span-1 sm:flex-1"
        />
      ) : (
        <Input
          type="text"
          value={scalarValue}
          onChange={(e) => handleValueChange(e.target.value)}
          placeholder="Value..."
          className="col-span-2 sm:col-span-1 sm:flex-1"
        />
      )}

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
