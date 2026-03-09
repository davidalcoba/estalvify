"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, CreditCard, Loader2, Tag, Zap } from "lucide-react";
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

  if (!transaction) return null;

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
    {ruleOpen && (
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
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="w-[min(96vw,680px)] max-h-[85vh] overflow-hidden p-0 gap-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">Transaction details</DialogTitle>

        <div className="px-5 py-4 border-b">
          <p className="text-sm text-muted-foreground">{transactionOperationType(transaction)}</p>
          <p className="text-lg font-semibold leading-tight">{transactionMerchant(transaction)}</p>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          <TransactionAmount
            amount={transaction.amount}
            currency={transaction.currency}
            direction={transaction.direction}
            locale={locale}
            className="text-2xl"
          />

          <div className="grid gap-2 text-sm">
            <p className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              {new Date(transaction.valueDate).toLocaleDateString(locale, {
                timeZone: timezone,
                weekday: "short",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
            <p className="flex items-center gap-2 text-muted-foreground">
              <CreditCard className="h-4 w-4" />
              {transaction.bankAccount.name}
            </p>
            {transaction.categoryName && (
              <p className="flex items-center gap-2 text-muted-foreground">
                <Tag className="h-4 w-4" />
                <CategoryChip
                  name={transaction.categoryName}
                  color={transaction.categoryColor}
                />
              </p>
            )}
          </div>

          {categories.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {transaction.categoryName ? "Change category" : "Categorize"}
              </p>
              <div className="flex items-center gap-2">
                <select
                  key={transaction.id}
                  defaultValue={transaction.categoryId ?? ""}
                  onChange={(e) => { if (e.target.value) handleRecategorize(e.target.value); }}
                  disabled={saving}
                  tabIndex={-1}
                  className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
                >
                  <option value="" disabled>Pick a category…</option>
                  <CategoryOptions categories={categories} />
                </select>
                {saving && <Loader2 className="h-4 w-4 animate-spin shrink-0 text-muted-foreground" />}
              </div>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2 text-amber-600 border-amber-200 hover:bg-amber-50 hover:text-amber-700"
            onClick={() => setRuleOpen(true)}
          >
            <Zap className="h-4 w-4" />
            Create rule
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
