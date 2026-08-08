"use client";

import { SimpleSelect } from "@/components/ui/simple-select";
import type { ConditionGroupOp } from "@/lib/rules/rule-dto";
import { useT } from "@/components/i18n/i18n-provider";

interface RuleMatchSelectProps {
  value: ConditionGroupOp;
  onValueChange: (op: ConditionGroupOp) => void;
}

/** How the conditions combine. "Any" is what the original rules needed and lacked. */
export function RuleMatchSelect({ value, onValueChange }: RuleMatchSelectProps) {
  const t = useT();
  return (
    <div className="flex items-center gap-2">
      <label className="text-sm font-medium">{t("rules.match")}</label>
      <SimpleSelect
        value={value}
        onValueChange={(v) => onValueChange(v as ConditionGroupOp)}
        ariaLabel={t("rules.match.aria")}
        className="w-[120px]"
        options={[
          { value: "AND", label: t("rules.match.all") },
          { value: "OR", label: t("rules.match.any") },
        ]}
      />
    </div>
  );
}
