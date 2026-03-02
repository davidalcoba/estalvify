import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { TransactionAmount } from "@/components/transactions/shared/transaction-amount";
import { TransactionMeta } from "@/components/transactions/shared/transaction-meta";
import type { TransactionListItemDTO } from "@/lib/transactions/transaction-dto";

interface TransactionItemProps {
  tx: TransactionListItemDTO;
  locale: string;
  dateText?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

export function TransactionItem({
  tx,
  locale,
  dateText,
  leading,
  trailing,
  onClick,
  className,
}: TransactionItemProps) {
  const isCredit = tx.direction === "CREDIT";

  return (
    <div
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 px-3 py-3",
        onClick ? "cursor-pointer transition-colors hover:bg-muted/30" : null,
        className
      )}
    >
      {leading}

      <div
        className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
          isCredit ? "bg-green-100 text-green-600" : "bg-red-100 text-red-500"
        )}
      >
        {isCredit ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
      </div>

      <TransactionMeta tx={tx} dateText={dateText} />

      <TransactionAmount
        amount={tx.amount}
        currency={tx.currency}
        direction={tx.direction}
        locale={locale}
        className="text-sm"
      />

      {trailing}
    </div>
  );
}
