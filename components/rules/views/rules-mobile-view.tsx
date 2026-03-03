"use client";

import { useState, useTransition } from "react";
import { Play, Trash2, CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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

interface RulesMobileViewProps {
  rules: CategoryRuleDTO[];
}

export function RulesMobileView({ rules }: RulesMobileViewProps) {
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
    <div className="space-y-3">
      {rules.map((rule) => (
        <RulesMobileCard key={rule.id} rule={rule} />
      ))}
    </div>
  );
}

function RulesMobileCard({ rule }: { rule: CategoryRuleDTO }) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  function handleExecute() {
    setResult(null);
    startTransition(async () => {
      const { categorized } = await executeRule(rule.id);
      setResult(
        categorized > 0
          ? `${categorized} transaction${categorized !== 1 ? "s" : ""} categorized`
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
    <Card className={`py-0 gap-0 ${!rule.isActive ? "opacity-60" : ""}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <button
            onClick={handleToggleActive}
            disabled={isPending}
            className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={rule.isActive ? "Deactivate" : "Activate"}
          >
            {rule.isActive ? (
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            ) : (
              <Circle className="h-5 w-5" />
            )}
          </button>

          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">{rule.name}</span>
              {!rule.isActive && (
                <Badge variant="secondary" className="text-xs">Inactive</Badge>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
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

            <div className="text-xs text-muted-foreground">
              {rule.sourceCategoryName && (
                <span>
                  From: <span style={{ color: rule.sourceCategoryColor ?? undefined }}>{rule.sourceCategoryName}</span>
                  {" → "}
                </span>
              )}
              <span>
                To:{" "}
                <span className="font-medium" style={{ color: rule.categoryColor }}>
                  {rule.categoryName}
                </span>
              </span>
            </div>

            {result && (
              <p className="text-xs text-green-600 font-medium">{result}</p>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleExecute}
              disabled={isPending || !rule.isActive}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              aria-label="Run"
              title="Run rule"
            >
              <Play className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleDelete}
              disabled={isPending}
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              aria-label="Delete"
              title="Delete rule"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
