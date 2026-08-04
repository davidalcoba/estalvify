"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { type Category } from "@/components/categorize/category-options";
import { CategorySelect } from "@/components/categorize/category-select";
import { setTransactionSplits } from "@/app/(app)/transactions/actions";
import {
  validateSplitLines,
  splitRemainder,
  type SplitLineInput,
} from "@/lib/transactions/splits";
import { formatCurrency } from "@/lib/formatters";
import { type TransactionListItemDTO } from "@/lib/transactions/transaction-dto";

interface LineDraft {
  amount: string;
  categoryId: string | null;
  note: string;
  isExtraordinary: boolean;
}

interface TransactionSplitDialogProps {
  open: boolean;
  transaction: TransactionListItemDTO;
  categories: Category[];
  locale: string;
  onClose: () => void;
}

// Break a bank row into lines that must add up to its amount — the tool that
// turns an opaque cash withdrawal into categorized spending. A line without a
// category is the honest "still unexplained" remainder.
export function TransactionSplitDialog({
  open,
  transaction,
  categories,
  locale,
  onClose,
}: TransactionSplitDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const total = Math.abs(transaction.amount);

  const isIncome = transaction.direction === "CREDIT";
  const [lines, setLines] = useState<LineDraft[]>(() =>
    transaction.splits.length > 0
      ? transaction.splits.map((s) => ({
          amount: String(s.amount),
          categoryId: s.categoryId,
          note: s.note ?? "",
          isExtraordinary: s.isExtraordinary,
        }))
      : [
          { amount: "", categoryId: null, note: "", isExtraordinary: false },
          { amount: "", categoryId: null, note: "", isExtraordinary: false },
        ]
  );

  const parsed: SplitLineInput[] = lines.map((l) => ({
    amount: Number(l.amount),
    categoryId: l.categoryId,
    note: l.note,
    isExtraordinary: l.isExtraordinary,
  }));
  const remainder = splitRemainder(total, parsed);
  const validationError = validateSplitLines(total, parsed);

  function patch(i: number, changes: Partial<LineDraft>) {
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...changes } : l)));
  }

  function save(newLines: SplitLineInput[]) {
    setError(null);
    startTransition(async () => {
      try {
        await setTransactionSplits(transaction.id, newLines);
        router.refresh();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="w-[min(96vw,560px)] max-h-[85vh] overflow-y-auto pt-8 px-6 pb-6">
        <DialogTitle>Split transaction</DialogTitle>
        <p className="text-sm text-muted-foreground">
          Break {formatCurrency(total, transaction.currency, locale)} into
          lines. They must add up exactly — leave the unexplained part as a line
          without category.
        </p>

        <div className="space-y-3">
          {lines.map((line, i) => (
            <div key={i} className="flex items-start gap-2">
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={line.amount}
                onChange={(e) => patch(i, { amount: e.target.value })}
                className="w-28 shrink-0"
                aria-label={`Line ${i + 1} amount`}
              />
              <div className="min-w-0 flex-1 space-y-1.5">
                <CategorySelect
                  defaultValue={line.categoryId ?? undefined}
                  onValueChange={(v) => patch(i, { categoryId: v || null })}
                  categories={categories}
                  ariaLabel={`Line ${i + 1} category`}
                  className="w-full"
                />
                <Input
                  placeholder="Note (optional)"
                  value={line.note}
                  onChange={(e) => patch(i, { note: e.target.value })}
                  aria-label={`Line ${i + 1} note`}
                />
                {isIncome && (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Checkbox
                      checked={line.isExtraordinary}
                      onCheckedChange={(checked) =>
                        patch(i, { isExtraordinary: checked === true })
                      }
                      aria-label={`Line ${i + 1} extraordinary`}
                    />
                    Extraordinary (a bonus or annual variable — kept out of
                    income averages)
                  </label>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 text-muted-foreground"
                onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}
                disabled={lines.length <= 2 || isPending}
                title="Remove line"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setLines((prev) => [
                ...prev,
                {
                  amount: remainder > 0 ? String(remainder) : "",
                  categoryId: null,
                  note: "",
                  isExtraordinary: false,
                },
              ])
            }
            disabled={isPending}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add line
          </Button>
          <span
            className={
              remainder === 0 ? "text-success" : "text-warning tabular-nums"
            }
          >
            {remainder === 0
              ? "Fully allocated"
              : `${formatCurrency(remainder, transaction.currency, locale)} left to allocate`}
          </span>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex items-center justify-between gap-2 pt-2">
          {transaction.splits.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive"
              onClick={() => save([])}
              disabled={isPending}
            >
              Remove split
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => save(parsed)}
              disabled={isPending || validationError !== null}
              title={validationError ?? undefined}
            >
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save split
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
