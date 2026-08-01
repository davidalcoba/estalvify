import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import type { TransactionDirection } from "@/lib/transactions/transaction-dto";

interface TransactionAmountProps {
  amount: number;
  currency: string;
  direction: TransactionDirection;
  locale: string;
  className?: string;
}

export function TransactionAmount({ amount, currency, direction, locale, className }: TransactionAmountProps) {
  return (
    <p
      className={cn(
        "font-semibold tabular-nums shrink-0",
        direction === "CREDIT" ? "text-success" : "text-foreground",
        className
      )}
    >
      {direction === "CREDIT" ? "+" : "−"}
      {formatCurrency(amount, currency, locale)}
    </p>
  );
}
