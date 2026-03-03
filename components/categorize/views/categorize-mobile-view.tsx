"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Inbox, Loader2, Tag, CheckCircle, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { type TransactionListItemDTO } from "@/lib/transactions/transaction-dto";
import { CategoryOptions, type Category } from "@/components/categorize/category-options";
import { TransactionItem } from "@/components/transactions/shared/transaction-item";
import { QuickRuleDialog } from "@/components/rules/quick-rule-dialog";

interface CategorizeMobileViewProps {
  transactions: TransactionListItemDTO[];
  categories: Category[];
  total: number;
  page: number;
  pageSize: number;
  locale: string;
  timezone: string;
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  onCategorize: (txId: string, categoryId: string) => void;
  pageUrl: (page: number) => string;
  isBulking?: boolean;
  bulkQueryCategoryId?: string;
  onBulkQueryCategoryChange?: (value: string) => void;
  onBulkByQuery?: () => void;
}

function fmtDate(dateIso: string, locale: string, timezone: string) {
  return new Date(dateIso).toLocaleDateString(locale, {
    timeZone: timezone,
    day: "numeric",
    month: "short",
  });
}

export function CategorizeMobileView({
  transactions,
  categories,
  total,
  page,
  pageSize,
  locale,
  timezone,
  searchInput,
  onSearchInputChange,
  onCategorize,
  pageUrl,
  isBulking,
  bulkQueryCategoryId,
  onBulkQueryCategoryChange,
  onBulkByQuery,
}: CategorizeMobileViewProps) {
  // Queue of transactions currently being processed in the sheet
  const [sheetQueue, setSheetQueue] = useState<TransactionListItemDTO[] | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  // Local set of IDs categorized during this sheet session (for advance logic)
  const [localDone, setLocalDone] = useState(new Set<string>());
  const [ruleOpen, setRuleOpen] = useState(false);

  const activeQuery = searchInput.trim();
  const filtered =
    activeQuery.length >= 3
      ? transactions.filter((tx) => {
          const lower = activeQuery.toLowerCase();
          return [tx.description, tx.creditorName, tx.debtorName, tx.remittanceInfo].some((f) =>
            f?.toLowerCase().includes(lower)
          );
        })
      : transactions;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  const allCaughtUp = total === 0;
  const noResults = filtered.length === 0 && transactions.length > 0 && activeQuery.length >= 3;
  const showBulkByQuery =
    onBulkByQuery && activeQuery.length >= 3 && filtered.length > 0 && categories.length > 0;

  const sheetOpen = sheetQueue !== null && sheetIndex < (sheetQueue?.length ?? 0);
  const currentTx = sheetOpen ? sheetQueue![sheetIndex] : null;

  function openSheet(tx: TransactionListItemDTO) {
    const idx = filtered.findIndex((t) => t.id === tx.id);
    setSheetQueue([...filtered]);
    setSheetIndex(idx >= 0 ? idx : 0);
    setLocalDone(new Set());
    setRuleOpen(false);
  }

  function closeSheet() {
    setSheetQueue(null);
    setRuleOpen(false);
  }

  function advanceOrClose(queue: TransactionListItemDTO[], afterIndex: number, done: Set<string>) {
    for (let i = afterIndex + 1; i < queue.length; i++) {
      if (!done.has(queue[i].id)) {
        setSheetIndex(i);
        return;
      }
    }
    closeSheet();
  }

  function handleCategorySelect(categoryId: string) {
    if (!categoryId || !currentTx || !sheetQueue) return;
    const txId = currentTx.id;
    const newDone = new Set([...localDone, txId]);
    setLocalDone(newDone);
    onCategorize(txId, categoryId);
    advanceOrClose(sheetQueue, sheetIndex, newDone);
  }

  function handleRuleSuccess() {
    if (!currentTx || !sheetQueue) return;
    const newDone = new Set([...localDone, currentTx.id]);
    setLocalDone(newDone);
    setRuleOpen(false);
    advanceOrClose(sheetQueue, sheetIndex, newDone);
  }

  return (
    <div className="space-y-4">
      {showBulkByQuery && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5">
          <span className="text-sm font-medium text-blue-700 w-full">
            Categorize all {filtered.length} matching as:
          </span>
          <select
            value={bulkQueryCategoryId ?? ""}
            onChange={(e) => onBulkQueryCategoryChange?.(e.target.value)}
            className="flex-1 h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
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
            className="bg-blue-600 hover:bg-blue-700 h-8"
          >
            {isBulking ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply to all"}
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
              <p className="text-sm text-muted-foreground mt-1">
                No transactions pending categorization.
              </p>
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
                No transactions match your filter.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => onSearchInputChange("")}>
              Clear
            </Button>
          </div>
        </Card>
      )}

      {filtered.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {rangeStart}–{rangeEnd} of {total}
            </p>
            <div className="flex items-center gap-1">
              {page > 1 ? (
                <Button variant="outline" size="sm" asChild className="h-7 w-7 p-0">
                  <a href={pageUrl(page - 1)}>
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </a>
                </Button>
              ) : (
                <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled>
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
              )}
              <span className="text-xs px-1.5 tabular-nums text-muted-foreground">
                {page}/{totalPages}
              </span>
              {page < totalPages ? (
                <Button variant="outline" size="sm" asChild className="h-7 w-7 p-0">
                  <a href={pageUrl(page + 1)}>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </a>
                </Button>
              ) : (
                <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-3">
            {filtered.map((tx) => (
              <Card
                key={tx.id}
                className="py-0 gap-0 overflow-hidden cursor-pointer active:opacity-80 transition-opacity"
                onClick={() => openSheet(tx)}
              >
                <CardContent className="p-0">
                  <TransactionItem
                    tx={tx}
                    locale={locale}
                    dateText={fmtDate(tx.bookingDate, locale, timezone)}
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Categorize sheet — stays open while advancing through transactions */}
      <Sheet open={sheetOpen} onOpenChange={(open) => { if (!open) closeSheet(); }}>
        <SheetContent side="bottom" className="rounded-t-xl pb-4">
          {currentTx && (
            <>
              <SheetHeader className="pb-1">
                <SheetTitle className="text-base">Categorize</SheetTitle>
              </SheetHeader>

              <div className="px-4 pb-3 border-b mb-4">
                <TransactionItem
                  tx={currentTx}
                  locale={locale}
                  dateText={fmtDate(currentTx.bookingDate, locale, timezone)}
                />
              </div>

              <div className="px-4">
                <div className="flex items-center gap-2">
                  <select
                    key={currentTx.id}
                    defaultValue=""
                    onChange={(e) => handleCategorySelect(e.target.value)}
                    className="flex-1 h-11 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="" disabled>
                      Select a category…
                    </option>
                    <CategoryOptions categories={categories} />
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-11 w-11 shrink-0 text-amber-600 border-amber-200 hover:bg-amber-50"
                    onClick={() => setRuleOpen(true)}
                    title="Create rule for this transaction"
                  >
                    <Zap className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Rule dialog — slides on top of the categorize sheet (no extra overlay) */}
      {ruleOpen && currentTx && (
        <QuickRuleDialog
          open
          onClose={() => setRuleOpen(false)}
          transaction={currentTx}
          categories={categories}
          onSuccess={handleRuleSuccess}
        />
      )}
    </div>
  );
}
