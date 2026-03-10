"use client";

import { useState, useTransition } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/formatters";
import type { BudgetCategoryDTO } from "@/lib/budget/budget-dto";
import { assignToCategory } from "@/app/(app)/budget/actions";

interface AssignMoneySheetProps {
  category: BudgetCategoryDTO | null;
  year: number;
  month: number;
  locale: string;
  currency: string;
  onClose: () => void;
}

export function AssignMoneySheet({
  category,
  year,
  month,
  locale,
  currency,
  onClose,
}: AssignMoneySheetProps) {
  const [value, setValue] = useState(
    category ? String(category.assigned > 0 ? category.assigned : "") : ""
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(open: boolean) {
    if (!open) onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!category) return;

    const amount = parseFloat(value.replace(",", ".")) || 0;
    if (amount < 0) {
      setError("Amount cannot be negative");
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        await assignToCategory(category.categoryId, year, month, amount);
        onClose();
      } catch {
        setError("Failed to save. Please try again.");
      }
    });
  }

  if (!category) return null;

  const suggested = category.target?.suggestedAmount ?? null;

  return (
    <Sheet open={!!category} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-sm">
        <SheetHeader>
          <SheetTitle>Assign to {category.categoryName}</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-4 px-1">
          <div className="rounded-lg border bg-muted/30 p-4 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Available</span>
              <span
                className={
                  category.available < 0
                    ? "text-red-600 font-medium"
                    : "font-medium"
                }
              >
                {formatCurrency(category.available, currency, locale)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Activity this month</span>
              <span>{formatCurrency(-category.activity, currency, locale)}</span>
            </div>
          </div>

          {suggested !== null && suggested > 0 && (
            <div className="rounded-md bg-indigo-50 border border-indigo-200 px-3 py-2 text-sm flex items-center justify-between gap-2">
              <span className="text-indigo-700">
                Target suggests {formatCurrency(suggested, currency, locale)}
              </span>
              <button
                type="button"
                className="text-indigo-600 underline text-xs"
                onClick={() => setValue(String(suggested))}
              >
                Use
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-1.5 block">
                Assign amount
              </label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="0.00"
                autoFocus
              />
              {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={isPending} className="flex-1">
                {isPending ? "Saving…" : "Save"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isPending}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
