"use client";

import { Inbox, Loader2, Tag, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TransactionItem } from "@/components/transactions/shared/transaction-item";
import { TransactionPagination } from "@/components/transactions/shared/transaction-pagination";
import {
  transactionMerchant,
  type TransactionListItemDTO,
} from "@/lib/transactions/transaction-dto";
import { CategoryOptions, type Category } from "@/components/categorize/category-options";

interface CategorizeDesktopViewProps {
  transactions: TransactionListItemDTO[];
  categories: Category[];
  total: number;
  page: number;
  pageSize: number;
  pageSizeOptions: number[];
  locale: string;
  timezone: string;
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  checkedIds: Set<string>;
  bulkCategoryId: string;
  bulkQueryCategoryId: string;
  isBulking: boolean;
  onBulkCategoryChange: (value: string) => void;
  onBulkQueryCategoryChange: (value: string) => void;
  onBulkApply: () => void;
  onBulkByQuery: () => void;
  onClearSelection: () => void;
  onToggleAll: () => void;
  onToggleCheck: (txId: string) => void;
  onCategorize: (txId: string, categoryId: string) => void;
  onOpenFocus: (index: number) => void;
  onPageSizeChange: (size: number) => void;
}

function fmtDate(dateIso: string, locale: string, timezone: string) {
  return new Date(dateIso).toLocaleDateString(locale, {
    timeZone: timezone,
    day: "numeric",
    month: "short",
  });
}

export function CategorizeDesktopView({
  transactions,
  categories,
  total,
  page,
  pageSize,
  pageSizeOptions,
  locale,
  timezone,
  searchInput,
  onSearchInputChange,
  checkedIds,
  bulkCategoryId,
  bulkQueryCategoryId,
  isBulking,
  onBulkCategoryChange,
  onBulkQueryCategoryChange,
  onBulkApply,
  onBulkByQuery,
  onClearSelection,
  onToggleAll,
  onToggleCheck,
  onCategorize,
  onOpenFocus,
  onPageSizeChange,
}: CategorizeDesktopViewProps) {
  const activeQuery = searchInput.trim();
  const filtered = activeQuery.length >= 3
    ? transactions.filter((tx) => {
        const lower = activeQuery.toLowerCase();
        return [tx.description, tx.remittanceInfo].some((f) =>
          f?.toLowerCase().includes(lower)
        );
      })
    : transactions;

  const checkedVisible = filtered.filter((tx) => checkedIds.has(tx.id));
  const allChecked = filtered.length > 0 && checkedVisible.length === filtered.length;
  const someChecked = checkedVisible.length > 0 && !allChecked;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);
  const pageQuery = new URLSearchParams({ size: String(pageSize) }).toString();

  const allCaughtUp = total === 0;
  const noResults = filtered.length === 0 && transactions.length > 0 && activeQuery.length >= 3;
  const showBulkByQuery = activeQuery.length >= 3 && filtered.length > 0 && checkedVisible.length === 0 && categories.length > 0;

  return (
    <div className="space-y-4">
      {showBulkByQuery && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
          <span className="text-sm font-medium text-blue-700 shrink-0">
            Categorize all {filtered.length} matching as:
          </span>
          <select
            value={bulkQueryCategoryId}
            onChange={(e) => onBulkQueryCategoryChange(e.target.value)}
            className="flex-1 min-w-40 h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="" disabled>
              Pick a category…
            </option>
            <CategoryOptions categories={categories} />
          </select>
          <Button
            size="sm"
            onClick={onBulkByQuery}
            disabled={!bulkQueryCategoryId || isBulking}
            className="bg-blue-600 hover:bg-blue-700 shrink-0"
          >
            {isBulking ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply to all"}
          </Button>
        </div>
      )}

      {checkedVisible.length > 0 && categories.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3">
          <span className="text-sm font-medium text-indigo-700 shrink-0">
            {checkedVisible.length} selected — categorize as:
          </span>
          <select
            value={bulkCategoryId}
            onChange={(e) => onBulkCategoryChange(e.target.value)}
            className="flex-1 min-w-40 h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="" disabled>
              Pick a category…
            </option>
            <CategoryOptions categories={categories} />
          </select>
          <Button
            size="sm"
            onClick={onBulkApply}
            disabled={!bulkCategoryId || isBulking}
            className="bg-indigo-600 hover:bg-indigo-700 shrink-0"
          >
            {isBulking ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
          </Button>
          <Button variant="ghost" size="sm" onClick={onClearSelection} className="shrink-0 text-muted-foreground">
            Clear
          </Button>
        </div>
      )}

      {allCaughtUp && (
        <Card className="border-dashed">
          <div className="flex flex-col items-center gap-3 py-12 text-center px-4">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="font-semibold">All caught up!</p>
              <p className="text-sm text-muted-foreground mt-1">No transactions pending categorization.</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Tag className="h-3.5 w-3.5" />
              <span>Transactions sync daily</span>
            </div>
          </div>
        </Card>
      )}

      {noResults && (
        <Card className="border-dashed">
          <div className="flex flex-col items-center gap-3 py-10 text-center px-4">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <Inbox className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-semibold">No matches</p>
              <p className="text-sm text-muted-foreground mt-1">
                No transactions on this page match &quot;{searchInput}&quot;.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => onSearchInputChange("")}>Clear filter</Button>
          </div>
        </Card>
      )}

      {filtered.length > 0 && (
        <>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">
                {activeQuery.length >= 3
                  ? `Showing ${filtered.length} of ${transactions.length} on this page`
                  : `Showing ${rangeStart}–${rangeEnd} of ${total} transactions`}
              </p>
              <select
                value={pageSize}
                onChange={(e) => onPageSizeChange(Number(e.target.value))}
                className="h-8 rounded border border-input bg-background px-2 text-sm text-muted-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {pageSizeOptions.map((s) => (
                  <option key={s} value={s}>
                    {s} / page
                  </option>
                ))}
              </select>
            </div>

            {totalPages > 1 && (
              <TransactionPagination
                page={page}
                totalPages={totalPages}
                pageQuery={pageQuery}
                basePath="/categorize"
              />
            )}
          </div>

          <Card className="py-0 gap-0 overflow-hidden">
            <CardContent className="p-0">
              <div className="divide-y">
                <div className="flex items-center gap-3 px-3 py-2 bg-muted/20">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    ref={(el) => {
                      if (el) el.indeterminate = someChecked;
                    }}
                    onChange={() => {}}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleAll();
                    }}
                    className="h-4 w-4 rounded border-gray-300 accent-indigo-600 cursor-pointer"
                  />
                  <span className="text-xs text-muted-foreground">
                    {someChecked || allChecked ? `${checkedVisible.length} selected` : "Select all"}
                  </span>
                </div>

                {filtered.map((tx, index) => {
                  const merchant = transactionMerchant(tx);
                  const checked = checkedIds.has(tx.id);

                  return (
                    <TransactionItem
                      key={tx.id}
                      tx={tx}
                      locale={locale}
                      dateText={fmtDate(tx.bookingDate, locale, timezone)}
                      onClick={() => onOpenFocus(index)}
                      className={`${
                        checked ? "bg-indigo-50 hover:bg-indigo-100" : "hover:bg-muted/30"
                      }`}
                      leading={
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {}}
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleCheck(tx.id);
                          }}
                          className="h-4 w-4 rounded border-gray-300 accent-indigo-600 cursor-pointer shrink-0"
                        />
                      }
                      trailing={
                        <select
                          value=""
                          onChange={(e) => {
                            if (e.target.value) {
                              onCategorize(tx.id, e.target.value);
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="h-8 max-w-40 min-w-28 rounded-md border border-input bg-background px-2 text-xs text-muted-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer shrink-0"
                          aria-label={`Categorize: ${merchant}`}
                        >
                          <option value="" disabled>
                            Category…
                          </option>
                          <CategoryOptions categories={categories} />
                        </select>
                      }
                    />
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
