import { ArrowDownLeft, ArrowUpRight, Calendar, CreditCard, Tag } from "lucide-react";
import { formatDate } from "@/lib/formatters";
import { TransactionAmount } from "@/components/transactions/shared/transaction-amount";
import { CategoryChip } from "@/components/transactions/shared/category-chip";
import {
  transactionMerchant,
  transactionOperationType,
  type TransactionListItemDTO,
} from "@/lib/transactions/transaction-dto";

// Shared "detail card" used by the desktop transaction dialog and the categorize
// focus modal (previously duplicated verbatim): direction icon + amount, merchant /
// operation, and a date / account / category meta row.
export function TransactionDetailCard({
  transaction,
  locale,
  timezone,
}: {
  transaction: TransactionListItemDTO;
  locale: string;
  timezone: string;
}) {
  return (
    <div className="rounded-xl border bg-muted/30 p-4 space-y-3 min-w-0 overflow-hidden">
      <div className="flex items-center gap-3">
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
            transaction.direction === "CREDIT"
              ? "bg-success/10 text-success"
              : "bg-destructive/10 text-destructive"
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

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground pt-1 border-t min-w-0">
        <span className="flex items-center gap-1 min-w-0">
          <Calendar className="h-3 w-3 shrink-0" />
          <span className="truncate">
            {formatDate(transaction.valueDate, locale, timezone, {
              weekday: "short",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </span>
        </span>
        <span className="flex items-center gap-1 min-w-0">
          <CreditCard className="h-3 w-3 shrink-0" />
          <span className="truncate">{transaction.bankAccount.name}</span>
        </span>
        {transaction.categoryName && (
          <span className="flex items-center gap-1 min-w-0">
            <Tag className="h-3 w-3 shrink-0" />
            <CategoryChip name={transaction.categoryName} color={transaction.categoryColor} />
          </span>
        )}
      </div>
    </div>
  );
}
