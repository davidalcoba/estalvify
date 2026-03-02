import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/formatters";
import { TransactionItem } from "@/components/transactions/shared/transaction-item";
import { TransactionPagination } from "@/components/transactions/shared/transaction-pagination";
import type { TransactionListItemDTO } from "@/lib/transactions/transaction-dto";

interface TransactionsDesktopViewProps {
  groupedTransactions: Array<{ dateKey: string; items: TransactionListItemDTO[] }>;
  page: number;
  totalPages: number;
  total: number;
  rangeStart: number;
  rangeEnd: number;
  userLocale: string;
  userTimezone: string;
  pageQuery: string;
  onOpenDetail: (transaction: TransactionListItemDTO) => void;
}

export function TransactionsDesktopView({
  groupedTransactions,
  page,
  totalPages,
  total,
  rangeStart,
  rangeEnd,
  userLocale,
  userTimezone,
  pageQuery,
  onOpenDetail,
}: TransactionsDesktopViewProps) {
  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {rangeStart}–{rangeEnd} of {total} transactions
        </p>
        <TransactionPagination page={page} totalPages={totalPages} pageQuery={pageQuery} />
      </div>

      <div className="space-y-6">
        {groupedTransactions.map(({ dateKey, items }) => (
          <div key={dateKey}>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              {formatDate(dateKey + "T12:00:00", userLocale, userTimezone, {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
            <Card className="py-0 gap-0 overflow-hidden">
              <CardContent className="p-0 divide-y">
                {items.map((tx) => (
                  <TransactionItem
                    key={tx.id}
                    tx={tx}
                    locale={userLocale}
                    onClick={() => onOpenDetail(tx)}
                  />
                ))}
              </CardContent>
            </Card>
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-muted-foreground">
            Showing {rangeStart}–{rangeEnd} of {total}
          </p>
          <TransactionPagination page={page} totalPages={totalPages} pageQuery={pageQuery} />
        </div>
      )}
    </>
  );
}
