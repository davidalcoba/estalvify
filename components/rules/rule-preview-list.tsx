"use client";

import { Card, CardContent } from "@/components/ui/card";
import { TransactionItem } from "@/components/transactions/shared/transaction-item";
import type { TransactionListItemDTO } from "@/lib/transactions/transaction-dto";

interface RulePreviewListProps {
  transactions: TransactionListItemDTO[];
  total: number;
  locale: string;
  previewLimit: number;
}

export function RulePreviewList({
  transactions,
  total,
  locale,
  previewLimit,
}: RulePreviewListProps) {
  if (transactions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No se encontraron transacciones que cumplan las condiciones.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {total > previewLimit ? (
          <>
            Mostrando{" "}
            <span className="font-medium text-foreground">{previewLimit}</span>{" "}
            de{" "}
            <span className="font-medium text-foreground">{total}</span>{" "}
            transacciones coincidentes
          </>
        ) : (
          <>
            <span className="font-medium text-foreground">{total}</span>{" "}
            transacción{total !== 1 ? "es" : ""} coincidente
            {total !== 1 ? "s" : ""}
          </>
        )}
      </p>

      <Card className="py-0 gap-0 overflow-hidden">
        <CardContent className="p-0 divide-y">
          {transactions.map((tx) => (
            <TransactionItem key={tx.id} tx={tx} locale={locale} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
