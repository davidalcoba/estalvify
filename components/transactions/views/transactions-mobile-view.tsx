import { Card, CardContent } from "@/components/ui/card";
import { TransactionItem } from "@/components/transactions/shared/transaction-item";
import { TransactionPagination } from "@/components/transactions/shared/transaction-pagination";
import type { TransactionListItemDTO } from "@/lib/transactions/transaction-dto";

interface TransactionsMobileViewProps {
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

function formatMobileDate(dateIso: string, locale: string, timezone: string) {
  return new Date(dateIso).toLocaleDateString(locale, {
    timeZone: timezone,
    day: "numeric",
    month: "short",
  });
}

function formatSectionDate(dateIso: string, locale: string, timezone: string) {
  return new Date(dateIso + "T12:00:00").toLocaleDateString(locale, {
    timeZone: timezone,
    weekday: "short",
    day: "numeric",
    month: "long",
  });
}

export function TransactionsMobileView({
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
}: TransactionsMobileViewProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {rangeStart}–{rangeEnd} of {total}
        </p>
        <TransactionPagination page={page} totalPages={totalPages} pageQuery={pageQuery} size="sm" />
      </div>

      {groupedTransactions.map(({ dateKey, items }) => (
        <section key={dateKey} className="space-y-2">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide px-1">
            {formatSectionDate(dateKey, userLocale, userTimezone)}
          </p>
          <div className="space-y-2">
            {items.map((tx) => (
              <Card key={tx.id} className="py-0 gap-0 overflow-hidden">
                <CardContent className="p-0">
                  <TransactionItem
                    tx={tx}
                    locale={userLocale}
                    dateText={formatMobileDate(tx.bookingDate, userLocale, userTimezone)}
                    onClick={() => onOpenDetail(tx)}
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ))}

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 pt-1">
          <p className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <TransactionPagination page={page} totalPages={totalPages} pageQuery={pageQuery} size="sm" />
        </div>
      )}
    </div>
  );
}
