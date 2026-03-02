import {
  transactionMerchant,
  transactionOperationType,
  type TransactionListItemDTO,
} from "@/lib/transactions/transaction-dto";
import { cn } from "@/lib/utils";
import { CategoryChip } from "@/components/transactions/shared/category-chip";

interface TransactionMetaProps {
  tx: TransactionListItemDTO;
  dateText?: string;
  className?: string;
}

export function TransactionMeta({ tx, dateText, className }: TransactionMetaProps) {
  const merchant = transactionMerchant(tx);
  const operation = transactionOperationType(tx);

  return (
    <div className={cn("flex-1 min-w-0", className)}>
      <p className="text-sm font-semibold truncate">{merchant}</p>
      <div className="mt-0.5 flex items-center gap-1.5 min-w-0 flex-wrap text-xs text-muted-foreground">
        <span className="truncate">
          {operation}
          {dateText ? ` · ${dateText}` : ""}
        </span>
        {tx.categoryName && (
          <CategoryChip name={tx.categoryName} color={tx.categoryColor} />
        )}
      </div>
    </div>
  );
}
