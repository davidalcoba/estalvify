"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, Calendar, CreditCard, Loader2, Tag, Zap } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TransactionAmount } from "@/components/transactions/shared/transaction-amount";
import { CategoryChip } from "@/components/transactions/shared/category-chip";
import { CategoryOptions, type Category } from "@/components/categorize/category-options";
import { QuickRuleDialog } from "@/components/rules/quick-rule-dialog";
import { categorizeTransaction } from "@/app/(app)/categorize/actions";
import {
  transactionMerchant,
  transactionOperationType,
  type TransactionListItemDTO,
} from "@/lib/transactions/transaction-dto";

interface TransactionDetailDialogProps {
  transaction: TransactionListItemDTO | null;
  locale: string;
  timezone: string;
  categories: Category[];
  onClose: () => void;
}

export function TransactionDetailDialog({
  transaction,
  locale,
  timezone,
  categories,
  onClose,
}: TransactionDetailDialogProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [ruleOpen, setRuleOpen] = useState(false);

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
          className="w-[min(96vw,640px)] max-h-[85vh] pt-8 px-6 pb-6 gap-0 overflow-hidden"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogTitle className="sr-only">Transaction details</DialogTitle>

          {transaction && (
            <div className="space-y-4 overflow-y-auto pr-2">
              <div className="rounded-xl border bg-muted/30 p-4 space-y-3 min-w-0 overflow-hidden">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      transaction.direction === "CREDIT"
                        ? "bg-green-100 text-green-600"
                        : "bg-red-100 text-red-500"
                    }`}
                  >
                    {transaction.direction === "CREDIT" ? (
                      <ArrowDownLeft className="h-4 w-4" />
                    ) : (
                      <ArrowUpRight className="h-4 w-4" />
                    )}
                  </div>
                  <TransactionAmount
                    amount={transaction.amount}
                    currency={transaction.currency}
                    direction={transaction.direction}
                    locale={locale}
                    className="text-xl"
                  />
                </div>

                <div className="min-w-0">
                  <p className="font-semibold leading-tight break-words">
                    {transactionMerchant(transaction)}
                  </p>
                  <p className="text-sm text-muted-foreground mt-0.5 break-words">
                    {transactionOperationType(transaction)}
                  </p>
                </div>

                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground pt-1 border-t min-w-0">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <Calendar className="h-3 w-3 shrink-0" />
                    <span className="truncate">
                      {new Date(transaction.valueDate).toLocaleDateString(locale, {
                        timeZone: timezone,
                        weekday: "short",
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5 min-w-0">
                    <CreditCard className="h-3 w-3 shrink-0" />
                    <span className="truncate">{transaction.bankAccount.name}</span>
                  </span>
                  {transaction.categoryName && (
                    <span className="flex items-center gap-1.5 min-w-0">
                      <Tag className="h-3 w-3 shrink-0" />
                      <CategoryChip
                        name={transaction.categoryName}
                        color={transaction.categoryColor}
                      />
                    </span>
                  )}
                </div>
              </div>

              {categories.length > 0 && (
                <div className="flex items-center gap-2">
                  <select
                    key={transaction.id}
                    defaultValue={transaction.categoryId ?? ""}
                    onChange={(e) => { if (e.target.value) handleRecategorize(e.target.value); }}
                    disabled={saving}
                    tabIndex={-1}
                    className="flex-1 h-10 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none disabled:opacity-60"
                  >
                    <option value="" disabled>Pick a category…</option>
                    <CategoryOptions categories={categories} />
                  </select>
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin shrink-0 text-muted-foreground" />
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 shrink-0 text-amber-600 border-amber-200 hover:bg-amber-50"
                      onClick={() => setRuleOpen(true)}
                      title="Create rule for this transaction"
                    >
                      <Zap className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
