"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Repeat, Zap } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TransactionDetailCard } from "@/components/transactions/shared/transaction-detail-card";
import { type Category } from "@/components/categorize/category-options";
import { CategorySelect } from "@/components/categorize/category-select";
import { QuickRuleDialog } from "@/components/rules/quick-rule-dialog";
import { categorizeTransaction } from "@/app/(app)/categorize/actions";
import { useCanWrite } from "@/components/layout/role-provider";
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
  const canWrite = useCanWrite();

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
          className="max-h-[85vh] gap-0 overflow-hidden pt-8 sm:w-[min(96vw,640px)] sm:max-w-[min(96vw,640px)]"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogTitle className="sr-only">Transaction details</DialogTitle>

          {transaction && (
            <div className="space-y-4 overflow-y-auto pr-2">
              <TransactionDetailCard transaction={transaction} locale={locale} dateLocale={dateLocale} timezone={timezone} />

              {canWrite && (
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
                  onClick={() => {
                    onClose();
                    router.push(`/recurring?fromTx=${transaction.id}`);
                  }}
                  disabled={saving}
                  title="Make recurring — opens the series form prefilled from this transaction"
                >
                  <Repeat className="h-4 w-4" />
                </Button>
              </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
