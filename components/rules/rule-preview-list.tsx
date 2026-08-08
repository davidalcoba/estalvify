"use client";

import { Card, CardContent } from "@/components/ui/card";
import { TransactionItem } from "@/components/transactions/shared/transaction-item";
import type { TransactionListItemDTO } from "@/lib/transactions/transaction-dto";
import { useT } from "@/components/i18n/i18n-provider";

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
  const t = useT();

  if (transactions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">
          {t("rules.preview.none")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {total > previewLimit
          ? t("rules.preview.showing", { shown: previewLimit, total })
          : t.plural("rules.preview.count", total)}
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
