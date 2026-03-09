"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { CategoryOptions, type Category } from "@/components/categorize/category-options";
import { RuleConditionRow } from "@/components/rules/rule-condition-row";
import {
  type CategoryRuleDTO,
  type RuleCondition,
  getDefaultOperator,
} from "@/lib/rules/rule-dto";
import { updateRule } from "@/app/(app)/rules/actions";

interface RuleEditDialogProps {
  rule: CategoryRuleDTO;
  categories: Category[];
  onClose: () => void;
}

function defaultCondition(): RuleCondition {
  return { field: "description", operator: getDefaultOperator("description"), value: "" };
}

export function RuleEditDialog({ rule, categories, onClose }: RuleEditDialogProps) {
  const [name, setName] = useState(rule.name);
  const [conditions, setConditions] = useState<RuleCondition[]>(rule.conditions);
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
          conditions: conditions.filter((c) => c.value.trim() !== ""),
          categoryId,
        });
        onClose();
      } catch {
        setError("Failed to save rule. Please try again.");
      }
    });
  }

  const canSave =
    name.trim() !== "" &&
    categoryId !== "" &&
    conditions.some((c) => c.value.trim() !== "") &&
    !isPending;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className="w-[min(96vw,600px)] max-h-[85vh] pt-8 px-6 pb-6 gap-0 overflow-hidden"
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
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Conditions{" "}
              <span className="font-normal text-muted-foreground">(all must match)</span>
            </label>
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

          {/* Target category */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Categorize as</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">— Select category —</option>
              <CategoryOptions categories={categories} />
            </select>
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
