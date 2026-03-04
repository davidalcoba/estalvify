"use client";

import { useState, useTransition } from "react";
import { Zap, Loader2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog as Primitive } from "radix-ui";
import { cn } from "@/lib/utils";
import { CategoryOptions, type Category } from "@/components/categorize/category-options";
import { RuleConditionRow } from "@/components/rules/rule-condition-row";
import { type RuleCondition, getDefaultOperator } from "@/lib/rules/rule-dto";
import { executeRuleOnce } from "@/app/(app)/rules/actions";
import type { TransactionListItemDTO } from "@/lib/transactions/transaction-dto";

interface QuickRuleDialogProps {
  open: boolean;
  onClose: () => void;
  transaction: TransactionListItemDTO;
  categories: Category[];
  /** Pre-selected target category. Leave empty to let user pick. */
  categoryId?: string;
  categoryName?: string;
  /** Called after a successful rule execution that categorized ≥1 tx. */
  onSuccess?: () => void;
}

function buildInitialCondition(tx: TransactionListItemDTO): RuleCondition {
  if (tx.creditorName) {
    return { field: "creditorName", operator: getDefaultOperator("creditorName"), value: tx.creditorName };
  }
  if (tx.debtorName) {
    return { field: "debtorName", operator: getDefaultOperator("debtorName"), value: tx.debtorName };
  }
  return { field: "description", operator: getDefaultOperator("description"), value: tx.description ?? "" };
}

export function QuickRuleDialog({
  open,
  onClose,
  transaction,
  categories,
  categoryId = "",
  categoryName = "",
  onSuccess,
}: QuickRuleDialogProps) {
  const [condition, setCondition] = useState<RuleCondition>(() => buildInitialCondition(transaction));
  const [targetCategoryId, setTargetCategoryId] = useState(categoryId);
  const [ruleName, setRuleName] = useState("");
  const [result, setResult] = useState<{ msg: string; categorized: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleConditionChange(_index: number, updated: RuleCondition) {
    setCondition(updated);
    setResult(null);
  }

  function handleSave() {
    if (!condition.value.trim() || !targetCategoryId) return;
    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        const res = await executeRuleOnce({
          conditions: [condition],
          sourceCategoryId: null,
          categoryId: targetCategoryId,
          ruleName: ruleName.trim() || null,
        });
        const msg =
          res.categorized > 0
            ? `${res.categorized} transaction${res.categorized !== 1 ? "s" : ""} categorized${res.savedRuleId ? " — rule saved" : ""}.`
            : "Rule applied — no new transactions matched.";
        setResult({ msg, categorized: res.categorized });
        if (res.categorized > 0) onSuccess?.();
      } catch {
        setError("Failed to apply rule. Please try again.");
      }
    });
  }

  const canSave = condition.value.trim() !== "" && !!targetCategoryId && !isPending;

  return (
    // Use Radix Dialog primitives directly so we can omit the overlay
    // (avoids stacking a second dark backdrop over an existing modal)
    <Primitive.Root open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <Primitive.Portal>
        <Primitive.Content
          onOpenAutoFocus={(e) => e.preventDefault()}
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 bg-background rounded-t-2xl border-t shadow-xl",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
            "duration-300"
          )}
        >
          {/* Handle bar */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/25" />
          </div>

          <div className="px-5 pb-6 space-y-5">
            {/* Header */}
            <div className="flex items-center gap-2 pt-1">
              <Zap className="h-4 w-4 text-amber-500 shrink-0" />
              <h2 className="font-semibold text-base">Create rule</h2>
            </div>

            {/* Condition */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">When…</p>
              <RuleConditionRow
                condition={condition}
                index={0}
                onChange={handleConditionChange}
                onRemove={() => {}}
                canRemove={false}
              />
            </div>

            {/* Target category */}
            <div className="space-y-2">
              <p className="text-sm font-semibold">Categorize As</p>
              <select
                value={targetCategoryId}
                onChange={(e) => setTargetCategoryId(e.target.value)}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">— Select category —</option>
                <CategoryOptions categories={categories} />
              </select>
            </div>

            {/* Rule name */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Rule name <span className="normal-case font-normal">(optional — fill to save it)</span>
              </p>
              <input
                type="text"
                value={ruleName}
                onChange={(e) => setRuleName(e.target.value)}
                placeholder={categoryName ? `e.g. ${categoryName}` : "e.g. Netflix, Groceries…"}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            {result ? (
              <div className="space-y-3">
                <p className="text-sm text-green-600 font-medium">{result.msg}</p>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={onClose}>
                    Close
                  </Button>
                  {result.categorized > 0 && (
                    <Button className="flex-1 gap-1" onClick={onClose}>
                      Next <ChevronRight className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={onClose} disabled={isPending}>
                  Cancel
                </Button>
                <Button className="flex-1 gap-2" onClick={handleSave} disabled={!canSave}>
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                  Apply rule
                </Button>
              </div>
            )}
          </div>
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
