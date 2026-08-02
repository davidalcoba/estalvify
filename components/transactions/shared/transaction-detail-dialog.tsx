"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Zap } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TransactionDetailCard } from "@/components/transactions/shared/transaction-detail-card";
import { type Category } from "@/components/categorize/category-options";
import { CategorySelect } from "@/components/categorize/category-select";
import { QuickRuleDialog } from "@/components/rules/quick-rule-dialog";
import { categorizeTransaction } from "@/app/(app)/categorize/actions";
import { useAction } from "@/lib/use-action";
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
  const { run, pending: saving } = useAction();
  const [ruleOpen, setRuleOpen] = useState(false);

  function handleRecategorize(categoryId: string) {
    if (!categoryId || !transaction) return;
    run("recategorize", async () => {
      await categorizeTransaction(transaction.id, categoryId);
      router.refresh();
    });
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
          className="w-[min(96vw,640px)] max-h-[85vh] pt-8 px-6 pb-6 gap-0 overflow-hidden"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogTitle className="sr-only">Transaction details</DialogTitle>

          {transaction && (
            <div className="space-y-4 overflow-y-auto pr-2">
              <TransactionDetailCard transaction={transaction} locale={locale} dateLocale={dateLocale} timezone={timezone} />

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
                  loading={saving}
                  title="Create rule for this transaction"
                >
                  <Zap className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
