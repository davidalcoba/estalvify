"use client";

import { SimpleSelect } from "@/components/ui/simple-select";
import type { ConditionGroupOp } from "@/lib/rules/rule-dto";

interface RuleMatchSelectProps {
  value: ConditionGroupOp;
  onValueChange: (op: ConditionGroupOp) => void;
}

/** How the conditions combine. "Any" is what the original rules needed and lacked. */
export function RuleMatchSelect({ value, onValueChange }: RuleMatchSelectProps) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-sm font-medium">Match</label>
      <SimpleSelect
        value={value}
        onValueChange={(v) => onValueChange(v as ConditionGroupOp)}
        ariaLabel="Match all or any condition"
        className="w-[120px]"
        options={[
          { value: "AND", label: "All" },
          { value: "OR", label: "Any" },
        ]}
      />
    </div>
  );
}
