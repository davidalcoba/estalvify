"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CategorySelect } from "@/components/categorize/category-select";
import type { CategoryOption } from "@/lib/budget/budget-dto";

export interface BudgetDialogTarget {
  mode: "add" | "edit";
  categoryId?: string;
  categoryName?: string;
  amount?: number;
}

// Add or edit a category's planned amount. In "edit" mode the category is fixed;
// in "add" mode the caller passes the still-available categories to choose from.
export function BudgetCategoryDialog({
  target,
  categories,
  onClose,
  onSubmit,
  pending,
}: {
  target: BudgetDialogTarget | null;
  categories: CategoryOption[];
  onClose: () => void;
  onSubmit: (categoryId: string, amount: number) => void;
  pending: boolean;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        {target && (
          // Remounts per target so the form initializes from props — no effect.
          <BudgetForm
            key={`${target.mode}-${target.categoryId ?? "new"}`}
            target={target}
            categories={categories}
            onClose={onClose}
            onSubmit={onSubmit}
            pending={pending}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function BudgetForm({
  target,
  categories,
  onClose,
  onSubmit,
  pending,
}: {
  target: BudgetDialogTarget;
  categories: CategoryOption[];
  onClose: () => void;
  onSubmit: (categoryId: string, amount: number) => void;
  pending: boolean;
}) {
  const isEdit = target.mode === "edit";
  const [categoryId, setCategoryId] = useState(target.categoryId ?? "");
  const [amount, setAmount] = useState(target.amount != null ? String(target.amount) : "");

  const parsedAmount = Number(amount);
  const canSave =
    categoryId !== "" && amount !== "" && Number.isFinite(parsedAmount) && parsedAmount >= 0;

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {isEdit ? `Edit ${target.categoryName} budget` : "Add category to budget"}
        </DialogTitle>
        <DialogDescription>
          Set how much you plan to spend in this category this month.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        {isEdit ? (
          <div className="text-sm font-medium">{target.categoryName}</div>
        ) : (
          <CategorySelect
            value={categoryId}
            onValueChange={setCategoryId}
            categories={categories}
            placeholder="Pick a category…"
            ariaLabel="Budget category"
            className="w-full"
          />
        )}

        <Input
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          aria-label="Planned amount"
          autoFocus
        />
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button onClick={() => canSave && onSubmit(categoryId, parsedAmount)} disabled={!canSave || pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </>
  );
}
