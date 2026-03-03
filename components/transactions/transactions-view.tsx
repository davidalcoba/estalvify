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
  const [activeTransactionId, setActiveTransactionId] = useState<string | null>(null);
  const transactionsById = useMemo(() => {
    const map = new Map<string, TransactionListItemDTO>();
    for (const group of props.groupedTransactions) {
      for (const item of group.items) {
        map.set(item.id, item);
      }
    }
    return map;
  }, [props.groupedTransactions]);

  const activeTransaction = activeTransactionId ? transactionsById.get(activeTransactionId) ?? null : null;

  return (
    <>
      <TransactionDetailDialog
        key={activeTransactionId ?? "none"}
        transaction={activeTransaction}
        locale={props.userLocale}
        timezone={props.userTimezone}
        categories={props.categories}
        onClose={() => setActiveTransactionId(null)}
      />

      <div className="hidden md:block">
        <TransactionsDesktopView
          {...props}
          onOpenDetail={(transaction) => setActiveTransactionId(transaction.id)}
        />
      </div>
      <div className="md:hidden">
        <TransactionsMobileView
          {...props}
          onOpenDetail={(transaction) => setActiveTransactionId(transaction.id)}
        />
      </div>
    </>
  );
}
