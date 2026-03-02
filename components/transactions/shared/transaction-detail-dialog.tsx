"use client";

import { Calendar, CreditCard, Tag } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { TransactionAmount } from "@/components/transactions/shared/transaction-amount";
import { CategoryChip } from "@/components/transactions/shared/category-chip";
import {
  transactionMerchant,
  transactionOperationType,
  type TransactionListItemDTO,
} from "@/lib/transactions/transaction-dto";

interface TransactionDetailDialogProps {
  transaction: TransactionListItemDTO | null;
  locale: string;
  timezone: string;
  onClose: () => void;
}

export function TransactionDetailDialog({
  transaction,
  locale,
  timezone,
  onClose,
}: TransactionDetailDialogProps) {
  if (!transaction) return null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[min(96vw,680px)] max-h-[85vh] overflow-hidden p-0 gap-0">
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
              {new Date(transaction.bookingDate).toLocaleDateString(locale, {
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

          {transaction.description && (
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                Raw description
              </p>
              <p className="text-sm break-words">{transaction.description}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
