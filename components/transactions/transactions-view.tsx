"use client";

import { useMemo, useState } from "react";
import type { TransactionListItemDTO } from "@/lib/transactions/transaction-dto";
import type { Category } from "@/components/categorize/category-options";
import { TransactionsDesktopView } from "@/components/transactions/views/transactions-desktop-view";
import { TransactionsMobileView } from "@/components/transactions/views/transactions-mobile-view";
import { TransactionDetailDialog } from "@/components/transactions/shared/transaction-detail-dialog";

interface TransactionsViewProps {
  groupedTransactions: Array<{ dateKey: string; items: TransactionListItemDTO[] }>;
  page: number;
  totalPages: number;
  total: number;
  rangeStart: number;
  rangeEnd: number;
  userLocale: string;
  userTimezone: string;
  pageQuery: string;
  categories: Category[];
}

export function TransactionsView(props: TransactionsViewProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const flatTransactions = useMemo(
    () => props.groupedTransactions.flatMap((g) => g.items),
    [props.groupedTransactions]
  );

  return (
    <>
      <TransactionDetailDialog
        transactions={flatTransactions}
        activeIndex={activeIndex}
        onNavigate={setActiveIndex}
        onClose={() => setActiveIndex(null)}
        locale={props.userLocale}
        timezone={props.userTimezone}
        categories={props.categories}
      />

      <div className="hidden md:block">
        <TransactionsDesktopView
          {...props}
          onOpenDetail={(tx) => {
            const idx = flatTransactions.findIndex((t) => t.id === tx.id);
            setActiveIndex(idx >= 0 ? idx : null);
          }}
        />
      </div>
      <div className="md:hidden">
        <TransactionsMobileView {...props} />
      </div>
    </>
  );
}
