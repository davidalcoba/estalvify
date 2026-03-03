"use client";

import { useState, useTransition } from "react";
import { Zap, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
}

function buildInitialCondition(tx: TransactionListItemDTO): RuleCondition {
  // Prefer creditorName as the most stable merchant identifier
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
}: QuickRuleDialogProps) {
  const [condition, setCondition] = useState<RuleCondition>(() =>
    buildInitialCondition(transaction)
  );
  const [targetCategoryId, setTargetCategoryId] = useState(categoryId);
  const [ruleName, setRuleName] = useState("");
  const [result, setResult] = useState<string | null>(null);
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
            : "Rule saved — no new transactions matched.";
        setResult(msg);
      } catch {
        setError("Failed to save rule. Please try again.");
      }
    });
  }

  const canSave = condition.value.trim() !== "" && !!targetCategoryId && !isPending;

  return (
    <Dialog open={open} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500" />
            Create rule
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Condition */}
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">When…</p>
            <RuleConditionRow
              condition={condition}
              index={0}
              onChange={handleConditionChange}
              onRemove={() => {}}
              canRemove={false}
            />
          </div>

          {/* Target category */}
          <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
            <span className="text-sm text-muted-foreground shrink-0">→ Categorize as</span>
            <select
              value={targetCategoryId}
              onChange={(e) => setTargetCategoryId(e.target.value)}
              className="flex-1 min-w-[160px] h-9 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <option value="">— Select category —</option>
              <CategoryOptions categories={categories} />
            </select>
          </div>

          {/* Rule name */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">
              Rule name <span className="font-normal">(optional — fill to save it)</span>
            </label>
            <input
              type="text"
              value={ruleName}
              onChange={(e) => setRuleName(e.target.value)}
              placeholder={categoryName ? `e.g. ${categoryName}` : "e.g. Netflix, Groceries…"}
              className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {result && <p className="text-sm text-green-600 font-medium">{result}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose} disabled={isPending}>
              {result ? "Close" : "Cancel"}
            </Button>
            {!result && (
              <Button onClick={handleSave} disabled={!canSave} className="gap-2">
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                Apply rule
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
