"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Split, Zap } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TransactionDetailCard } from "@/components/transactions/shared/transaction-detail-card";
import { TransactionSplitDialog } from "@/components/transactions/shared/transaction-split-dialog";
import { CategoryChip } from "@/components/transactions/shared/category-chip";
import { type Category } from "@/components/categorize/category-options";
import { CategorySelect } from "@/components/categorize/category-select";
import { QuickRuleDialog } from "@/components/rules/quick-rule-dialog";
import { categorizeTransaction } from "@/app/(app)/categorize/actions";
import { formatCurrency } from "@/lib/formatters";
import { type TransactionListItemDTO } from "@/lib/transactions/transaction-dto";

interface TransactionDetailDialogProps {
  transaction: TransactionListItemDTO | null;
  locale: string;
  dateLocale: string;
  timezone: string;
  categories: Category[];
  onClose: () => void;
}

export function TransactionDetailDialog({
  transaction,
  locale,
  dateLocale,
  timezone,
  categories,
  onClose,
}: TransactionDetailDialogProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [ruleOpen, setRuleOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);

  async function handleRecategorize(categoryId: string) {
    if (!categoryId || !transaction) return;
    setSaving(true);
    try {
      await categorizeTransaction(transaction.id, categoryId);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {splitOpen && transaction && (
        <TransactionSplitDialog
          open={splitOpen}
          transaction={transaction}
          categories={categories}
          locale={locale}
          onClose={() => setSplitOpen(false)}
        />
      )}
      {ruleOpen && transaction && (
        <QuickRuleDialog
          open={ruleOpen}
          onClose={() => setRuleOpen(false)}
          transaction={transaction}
          categories={categories}
          categoryId={transaction.categoryId ?? ""}
          categoryName={transaction.categoryName ?? ""}
          mode="dialog"
          onSuccess={() => { setRuleOpen(false); router.refresh(); }}
        />
      )}
      <Dialog open={!!transaction} onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent
          className="w-[min(96vw,640px)] max-h-[85vh] pt-8 px-6 pb-6 gap-0 overflow-hidden"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogTitle className="sr-only">Transaction details</DialogTitle>

          {transaction && (
            <div className="space-y-4 overflow-y-auto pr-2">
              <TransactionDetailCard transaction={transaction} locale={locale} dateLocale={dateLocale} timezone={timezone} />

              {transaction.splits.length > 0 && (
                <div className="rounded-lg border p-3">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    Split into {transaction.splits.length} lines
                  </p>
                  <ul className="space-y-1.5 text-sm">
                    {transaction.splits.map((s) => (
                      <li key={s.id} className="flex items-center gap-2">
                        <span className="w-20 shrink-0 tabular-nums">
                          {formatCurrency(s.amount, transaction.currency, locale)}
                        </span>
                        {s.categoryName ? (
                          <CategoryChip name={s.categoryName} color={s.categoryColor} />
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Unassigned
                          </span>
                        )}
                        {s.isExtraordinary && (
                          <span className="text-xs text-warning">extraordinary</span>
                        )}
                        {s.note && (
                          <span className="min-w-0 truncate text-xs text-muted-foreground">
                            {s.note}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex items-center gap-2">
                <CategorySelect
                  key={transaction.id}
                  defaultValue={transaction.categoryId ?? undefined}
                  onValueChange={(v) => { if (v) handleRecategorize(v); }}
                  disabled={saving}
                  categories={categories}
                  ariaLabel="Recategorize transaction"
                  className="flex-1 h-10"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 shrink-0 text-warning border-warning/30 hover:bg-warning/10"
                  onClick={() => setRuleOpen(true)}
                  disabled={saving}
                  title="Create rule for this transaction"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 shrink-0"
                  onClick={() => setSplitOpen(true)}
                  disabled={saving}
                  title={
                    transaction.splits.length > 0
                      ? "Edit split"
                      : "Split into lines (e.g. break down a cash withdrawal)"
                  }
                >
                  <Split className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
