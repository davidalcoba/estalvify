"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { type Category } from "@/components/categorize/category-options";
import { CategorySelect } from "@/components/categorize/category-select";
import { RuleConditionRow } from "@/components/rules/rule-condition-row";
import { RuleMatchSelect } from "@/components/rules/rule-match-select";
import {
  type CategoryRuleDTO,
  type ConditionGroupOp,
  type RuleCondition,
  getDefaultOperator,
  getDefaultValue,
  hasConditionValue,
} from "@/lib/rules/rule-dto";
import { updateRule } from "@/app/(app)/rules/actions";

interface RuleEditDialogProps {
  rule: CategoryRuleDTO;
  categories: Category[];
  onClose: () => void;
}

function defaultCondition(): RuleCondition {
  return {
    field: "any",
    operator: getDefaultOperator("any"),
    value: getDefaultValue("any"),
  };
}

export function RuleEditDialog({ rule, categories, onClose }: RuleEditDialogProps) {
  const [name, setName] = useState(rule.name);
  const [match, setMatch] = useState<ConditionGroupOp>(rule.match);
  const [conditions, setConditions] = useState<RuleCondition[]>(
    rule.conditionTree.children as RuleCondition[]
  );
  const [categoryId, setCategoryId] = useState(rule.categoryId);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleConditionChange(index: number, updated: RuleCondition) {
    setConditions((prev) => prev.map((c, i) => (i === index ? updated : c)));
  }

  function handleConditionRemove(index: number) {
    setConditions((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      try {
        await updateRule({
          ruleId: rule.id,
          name,
          conditions: { op: match, children: conditions.filter(hasConditionValue) },
          categoryId,
        });
        onClose();
      } catch {
        setError("Failed to save rule. Please try again.");
      }
    });
  }

  const canSave =
    !rule.isNested &&
    name.trim() !== "" &&
    categoryId !== "" &&
    conditions.some(hasConditionValue) &&
    !isPending;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      {/* 720px: wide enough for a whole condition row (field + negate + operator
          + value) without squeezing the value input down to nothing. */}
      <DialogContent
        className="sm:w-[min(96vw,720px)] max-h-[85vh] pt-8 px-6 pb-6 gap-0 overflow-hidden"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogTitle>Edit rule</DialogTitle>

        <div className="space-y-5 overflow-y-auto pr-1 mt-4">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Rule name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Conditions */}
          {rule.isNested ? (
            // Nested groups can't round-trip through the one-level editor, so
            // show them rather than silently flattening and losing the rule.
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Conditions</label>
              <pre className="max-h-48 overflow-auto rounded-md border bg-muted/40 p-3 text-xs">
                {JSON.stringify(rule.conditionTree, null, 2)}
              </pre>
              <p className="text-sm text-muted-foreground">
                Nested groups — edit via MCP.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <RuleMatchSelect value={match} onValueChange={setMatch} />
              <div className="space-y-2">
                {conditions.map((condition, index) => (
                  <RuleConditionRow
                    key={index}
                    condition={condition}
                    index={index}
                    onChange={handleConditionChange}
                    onRemove={handleConditionRemove}
                    canRemove={conditions.length > 1}
                  />
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConditions((prev) => [...prev, defaultCondition()])}
                className="gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                Add condition
              </Button>
            </div>
          )}

          {/* Target category */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Categorize as</label>
            <CategorySelect
              value={categoryId}
              onValueChange={setCategoryId}
              categories={categories}
              placeholder="— Select category —"
              ariaLabel="Categorize as"
              className="w-full"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button className="flex-1 gap-2" onClick={handleSave} disabled={!canSave}>
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
