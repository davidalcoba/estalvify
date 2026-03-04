"use client";

import { useState, useTransition } from "react";
import { Play, Trash2, CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  type CategoryRuleDTO,
  FIELD_LABELS,
  OPERATOR_LABELS,
} from "@/lib/rules/rule-dto";
import {
  executeRule,
  deleteRule,
  toggleRuleActive,
} from "@/app/(app)/rules/actions";

interface RulesDesktopViewProps {
  rules: CategoryRuleDTO[];
}

export function RulesDesktopView({ rules }: RulesDesktopViewProps) {
  if (rules.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No saved rules yet. Create your first rule above.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/30">
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-8"></th>
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Name</th>
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden lg:table-cell">Conditions</th>
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Target</th>
            <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rules.map((rule) => (
            <RulesDesktopRow key={rule.id} rule={rule} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RulesDesktopRow({ rule }: { rule: CategoryRuleDTO }) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  function handleExecute() {
    setResult(null);
    startTransition(async () => {
      const { categorized } = await executeRule(rule.id);
      setResult(
        categorized > 0
          ? `${categorized} categorized`
          : "No matches"
      );
    });
  }

  function handleDelete() {
    startTransition(async () => {
      await deleteRule(rule.id);
    });
  }

  function handleToggleActive() {
    startTransition(async () => {
      await toggleRuleActive(rule.id, !rule.isActive);
    });
  }

  return (
    <tr className={`hover:bg-muted/20 transition-colors ${!rule.isActive ? "opacity-60" : ""}`}>
      {/* Active toggle */}
      <td className="px-4 py-3">
        <button
          onClick={handleToggleActive}
          disabled={isPending}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label={rule.isActive ? "Deactivate rule" : "Activate rule"}
        >
          {rule.isActive ? (
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          ) : (
            <Circle className="h-4 w-4" />
          )}
        </button>
      </td>

      {/* Name */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-medium">{rule.name}</span>
          {!rule.isActive && (
            <Badge variant="secondary" className="text-xs">Inactive</Badge>
          )}
        </div>
        {result && (
          <p className="text-xs text-green-600 font-medium mt-0.5">{result}</p>
        )}
      </td>

      {/* Conditions summary */}
      <td className="px-4 py-3 hidden lg:table-cell">
        <div className="flex flex-wrap gap-1">
          {rule.conditions.slice(0, 2).map((c, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted rounded px-2 py-0.5"
            >
              <span className="font-medium">{FIELD_LABELS[c.field]}</span>
              <span>{OPERATOR_LABELS[c.operator]}</span>
              <span className="font-medium truncate max-w-[80px]">&quot;{c.value}&quot;</span>
            </span>
          ))}
          {rule.conditions.length > 2 && (
            <span className="text-xs text-muted-foreground">
              +{rule.conditions.length - 2} more
            </span>
          )}
        </div>
      </td>

      {/* Target category */}
      <td className="px-4 py-3">
        <div className="space-y-0.5">
          {rule.sourceCategoryName && (
            <p className="text-xs text-muted-foreground">
              From:{" "}
              <span style={{ color: rule.sourceCategoryColor ?? undefined }}>
                {rule.sourceCategoryName}
              </span>
            </p>
          )}
          <p
            className="text-xs font-medium"
            style={{ color: rule.categoryColor }}
          >
            {rule.categoryName}
          </p>
        </div>
      </td>

      {/* Actions */}
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleExecute}
            disabled={isPending || !rule.isActive}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            aria-label="Run rule"
            title="Run rule"
          >
            <Play className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleDelete}
            disabled={isPending}
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            aria-label="Delete rule"
            title="Delete rule"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </td>
    </tr>
  );
}
