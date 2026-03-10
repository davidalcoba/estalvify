"use client";

import { useState, useTransition } from "react";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BudgetCategoryDTO, TargetType } from "@/lib/budget/budget-dto";
import { setCategoryTarget, deleteCategoryTarget } from "@/app/(app)/budget/actions";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface CategoryTargetSheetProps {
  category: BudgetCategoryDTO | null;
  onClose: () => void;
}

export function CategoryTargetSheet({ category, onClose }: CategoryTargetSheetProps) {
  const existing = category?.target;

  const [targetType, setTargetType] = useState<TargetType>(
    existing?.targetType ?? "MONTHLY"
  );
  const [amount, setAmount] = useState(
    existing ? String(existing.amount) : ""
  );
  const [dueMonth, setDueMonth] = useState<number>(existing?.dueMonth ?? 12);
  const [specificMonths, setSpecificMonths] = useState<number[]>(
    existing?.specificMonths ?? []
  );

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggleMonth(m: number) {
    setSpecificMonths((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m].sort((a, b) => a - b)
    );
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!category) return;

    const parsedAmount = parseFloat(amount.replace(",", "."));
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError("Enter a valid positive amount");
      return;
    }
    if (targetType === "SPECIFIC_MONTHS" && specificMonths.length === 0) {
      setError("Select at least one month");
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        await setCategoryTarget(
          category.categoryId,
          targetType,
          parsedAmount,
          targetType === "YEARLY" ? dueMonth : null,
          targetType === "SPECIFIC_MONTHS" ? specificMonths : null
        );
        onClose();
      } catch {
        setError("Failed to save. Please try again.");
      }
    });
  }

  function handleDelete() {
    if (!category) return;
    startTransition(async () => {
      try {
        await deleteCategoryTarget(category.categoryId);
        onClose();
      } catch {
        setError("Failed to delete. Please try again.");
      }
    });
  }

  return (
    <ResponsiveModal
      open={!!category}
      onOpenChange={(open) => !open && onClose()}
      title={category ? `Target: ${category.categoryName}` : "Target"}
    >
      {category && (
        <form onSubmit={handleSave} className="space-y-5">
          {/* Target type */}
          <div>
            <label className="text-sm font-medium mb-2 block">Target type</label>
            <div className="grid grid-cols-3 gap-2">
              {(["MONTHLY", "YEARLY", "SPECIFIC_MONTHS"] as TargetType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setTargetType(type)}
                  className={`rounded-md border px-2 py-2 text-xs font-medium transition-colors ${
                    targetType === type
                      ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                      : "border-border bg-background hover:bg-muted"
                  }`}
                >
                  {type === "MONTHLY" && "Monthly"}
                  {type === "YEARLY" && "Yearly"}
                  {type === "SPECIFIC_MONTHS" && "Specific months"}
                </button>
              ))}
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">
              {targetType === "MONTHLY" && "Amount per month"}
              {targetType === "YEARLY" && "Total yearly amount"}
              {targetType === "SPECIFIC_MONTHS" && "Amount per occurrence"}
            </label>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>

          {/* Yearly: due month */}
          {targetType === "YEARLY" && (
            <div>
              <label className="text-sm font-medium mb-1.5 block">Due month</label>
              <select
                value={dueMonth}
                onChange={(e) => setDueMonth(Number(e.target.value))}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                {MONTH_NAMES.map((name, i) => (
                  <option key={i + 1} value={i + 1}>{name}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-1">
                Monthly suggested = remaining / months until {MONTH_NAMES[dueMonth - 1]}
              </p>
            </div>
          )}

          {/* Specific months picker */}
          {targetType === "SPECIFIC_MONTHS" && (
            <div>
              <label className="text-sm font-medium mb-2 block">Months</label>
              <div className="grid grid-cols-4 gap-1.5">
                {MONTH_NAMES.map((name, i) => (
                  <button
                    key={i + 1}
                    type="button"
                    onClick={() => toggleMonth(i + 1)}
                    className={`rounded border px-1 py-1.5 text-xs font-medium transition-colors ${
                      specificMonths.includes(i + 1)
                        ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    {name.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex gap-2 pt-1">
            <Button type="submit" disabled={isPending} className="flex-1">
              {isPending ? "Saving…" : "Save target"}
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

          {existing && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full text-red-500 hover:text-red-600 hover:bg-red-50"
              onClick={handleDelete}
              disabled={isPending}
            >
              Remove target
            </Button>
          )}
        </form>
      )}
    </ResponsiveModal>
  );
}
