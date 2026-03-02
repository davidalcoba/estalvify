"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Calendar,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { CategoryOptions, type Category } from "@/components/categorize/category-options";
import { CategorizeDesktopView } from "@/components/categorize/views/categorize-desktop-view";
import { CategorizeMobileView } from "@/components/categorize/views/categorize-mobile-view";
import { TransactionAmount } from "@/components/transactions/shared/transaction-amount";
import {
  transactionMerchant,
  transactionOperationType,
  type TransactionListItemDTO,
} from "@/lib/transactions/transaction-dto";
import {
  bulkCategorizeByIds,
  categorizeTransaction,
} from "@/app/(app)/categorize/actions";

interface Props {
  transactions: TransactionListItemDTO[];
  categories: Category[];
  total: number;
  page: number;
  pageSize: number;
  pageSizeOptions: number[];
  locale: string;
  timezone: string;
}

interface FocusModalProps {
  snapshot: TransactionListItemDTO[];
  startIndex: number;
  categories: Category[];
  locale: string;
  timezone: string;
  onClose: () => void;
  onCategorized: (txId: string) => void;
  onReverted: (txId: string) => void;
}

function matchesSearch(tx: TransactionListItemDTO, query: string): boolean {
  const lower = query.toLowerCase();
  return [tx.description, tx.creditorName, tx.debtorName, tx.remittanceInfo].some((field) =>
    field?.toLowerCase().includes(lower)
  );
}

function fmtDateLong(dateIso: string, locale: string, timezone: string): string {
  return new Date(dateIso).toLocaleDateString(locale, {
    timeZone: timezone,
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function FocusModal({
  snapshot,
  startIndex,
  categories,
  locale,
  timezone,
  onClose,
  onCategorized,
  onReverted,
}: FocusModalProps) {
  const [queue, setQueue] = useState<TransactionListItemDTO[]>(snapshot);
  const [index, setIndex] = useState(Math.min(startIndex, Math.max(0, snapshot.length - 1)));
  const [savingCount, setSavingCount] = useState(0);

  const current = queue[index] ?? null;
  const total = snapshot.length;
  const done = queue.length === 0;
  const categorizedCount = total - queue.length;

  function handleCategorySelect(categoryId: string) {
    if (!categoryId || !current) return;

    const txId = current.id;
    const currentTx = current;

    const newQueue = queue.filter((tx) => tx.id !== txId);
    const newIndex = Math.min(index, Math.max(0, newQueue.length - 1));
    setQueue(newQueue);
    setIndex(newIndex);
    onCategorized(txId);

    setSavingCount((count) => count + 1);
    void categorizeTransaction(txId, categoryId)
      .catch(() => {
        onReverted(txId);
        setQueue((prev) => {
          const next = [...prev];
          next.splice(Math.min(index, next.length), 0, currentTx);
          return next;
        });
      })
      .finally(() => {
        setSavingCount((count) => Math.max(0, count - 1));
      });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[min(96vw,640px)] max-h-[85vh] p-0 gap-0 overflow-hidden">
        <DialogTitle className="sr-only">Categorize transaction queue</DialogTitle>
        <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b">
          <span className="text-sm text-muted-foreground tabular-nums">
            {done ? "All done!" : `${index + 1} / ${queue.length}`}
            {categorizedCount > 0 && !done && (
              <span className="ml-2 text-green-600 font-medium">✓ {categorizedCount}</span>
            )}
            {savingCount > 0 && (
              <span className="ml-2 text-muted-foreground">Saving {savingCount}…</span>
            )}
          </span>
          <button
            onClick={onClose}
            className="rounded-sm opacity-70 hover:opacity-100 transition-opacity"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-4 space-y-4 overflow-y-auto">
          {done ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="font-semibold">Page done!</p>
                <p className="text-sm text-muted-foreground">
                  {categorizedCount} transaction{categorizedCount !== 1 ? "s" : ""} categorized.
                </p>
              </div>
              <Button onClick={onClose}>Close</Button>
            </div>
          ) : current ? (
            <>
              <div className="rounded-xl border bg-muted/30 p-4 space-y-3 min-w-0 overflow-hidden">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      current.direction === "CREDIT"
                        ? "bg-green-100 text-green-600"
                        : "bg-red-100 text-red-500"
                    }`}
                  >
                    {current.direction === "CREDIT" ? (
                      <ArrowDownLeft className="h-4 w-4" />
                    ) : (
                      <ArrowUpRight className="h-4 w-4" />
                    )}
                  </div>
                  <TransactionAmount
                    amount={current.amount}
                    currency={current.currency}
                    direction={current.direction}
                    locale={locale}
                    className="text-xl"
                  />
                </div>

                <div className="min-w-0">
                  <p className="font-semibold leading-tight break-words">
                    {transactionMerchant(current)}
                  </p>
                  <p className="text-sm text-muted-foreground mt-0.5 break-words">
                    {transactionOperationType(current)}
                  </p>
                </div>

                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground pt-1 border-t min-w-0">
                  <span className="flex items-center gap-1 min-w-0">
                    <Calendar className="h-3 w-3" />
                    <span className="truncate">
                      {fmtDateLong(current.bookingDate, locale, timezone)}
                    </span>
                  </span>
                </div>
              </div>

              <select
                key={current.id}
                defaultValue=""
                onChange={(e) => handleCategorySelect(e.target.value)}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
              >
                <option value="" disabled>
                  Pick a category…
                </option>
                <CategoryOptions categories={categories} />
              </select>

              <div className="flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIndex((i) => i - 1)}
                  disabled={index === 0}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" /> Prev
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIndex((i) => Math.min(i + 1, queue.length - 1))}
                  disabled={index >= queue.length - 1}
                >
                  Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CategorizeInbox({
  transactions,
  categories,
  total,
  page,
  pageSize,
  pageSizeOptions,
  locale,
  timezone,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [searchInput, setSearchInput] = useState("");
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [bulkCategoryId, setBulkCategoryId] = useState("");
  const [isBulking, setIsBulking] = useState(false);
  const [categorizedIds, setCategorizedIds] = useState<Set<string>>(new Set());
  const [focusState, setFocusState] = useState<{ snapshot: TransactionListItemDTO[]; index: number } | null>(null);

  const available = useMemo(
    () => transactions.filter((tx) => !categorizedIds.has(tx.id)),
    [transactions, categorizedIds]
  );

  const filtered = useMemo(() => {
    const query = searchInput.trim();
    if (!query) return available;
    return available.filter((tx) => matchesSearch(tx, query));
  }, [available, searchInput]);

  const checkedVisible = useMemo(
    () => filtered.filter((tx) => checkedIds.has(tx.id)),
    [filtered, checkedIds]
  );

  function toggleCheck(txId: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(txId)) next.delete(txId);
      else next.add(txId);
      return next;
    });
  }

  function toggleAll() {
    const allChecked = filtered.length > 0 && checkedVisible.length === filtered.length;
    if (allChecked || checkedVisible.length > 0) {
      setCheckedIds(new Set());
      return;
    }
    setCheckedIds(new Set(filtered.map((tx) => tx.id)));
  }

  async function handleBulkApply() {
    if (!bulkCategoryId || checkedVisible.length === 0) return;

    const ids = checkedVisible.map((tx) => tx.id);
    setIsBulking(true);
    setCategorizedIds((prev) => new Set([...prev, ...ids]));
    setCheckedIds(new Set());
    setBulkCategoryId("");

    try {
      await bulkCategorizeByIds(ids, bulkCategoryId);
    } catch {
      setCategorizedIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    } finally {
      setIsBulking(false);
    }
  }

  function handleCategorize(txId: string, categoryId: string) {
    if (!categoryId) return;

    setCategorizedIds((prev) => new Set([...prev, txId]));

    startTransition(async () => {
      try {
        await categorizeTransaction(txId, categoryId);
      } catch {
        setCategorizedIds((prev) => {
          const next = new Set(prev);
          next.delete(txId);
          return next;
        });
      }
    });
  }

  const handleFocusCategorized = useCallback((txId: string) => {
    setCategorizedIds((prev) => new Set([...prev, txId]));
  }, []);

  const handleFocusReverted = useCallback((txId: string) => {
    setCategorizedIds((prev) => {
      const next = new Set(prev);
      next.delete(txId);
      return next;
    });
  }, []);

  function openFocus(index: number) {
    setFocusState({ snapshot: filtered, index });
  }

  function handlePageSizeChange(newSize: number) {
    const sp = new URLSearchParams({ size: String(newSize) });
    startTransition(() => {
      router.push(`/categorize?${sp.toString()}`);
    });
  }

  function pageUrl(nextPage: number) {
    const sp = new URLSearchParams({ page: String(nextPage), size: String(pageSize) });
    return `/categorize?${sp.toString()}`;
  }

  return (
    <>
      {focusState && (
        <FocusModal
          snapshot={focusState.snapshot}
          startIndex={focusState.index}
          categories={categories}
          locale={locale}
          timezone={timezone}
          onClose={() => setFocusState(null)}
          onCategorized={handleFocusCategorized}
          onReverted={handleFocusReverted}
        />
      )}

      <div className="w-full">
        <div className="hidden md:block">
          <CategorizeDesktopView
            transactions={available}
            categories={categories}
            total={total}
            page={page}
            pageSize={pageSize}
            pageSizeOptions={pageSizeOptions}
            locale={locale}
            timezone={timezone}
            searchInput={searchInput}
            onSearchInputChange={setSearchInput}
            checkedIds={checkedIds}
            bulkCategoryId={bulkCategoryId}
            isBulking={isBulking}
            onBulkCategoryChange={setBulkCategoryId}
            onBulkApply={handleBulkApply}
            onClearSelection={() => setCheckedIds(new Set())}
            onToggleAll={toggleAll}
            onToggleCheck={toggleCheck}
            onCategorize={handleCategorize}
            onOpenFocus={openFocus}
            onPageSizeChange={handlePageSizeChange}
          />
        </div>
        <div className="md:hidden">
          <CategorizeMobileView
            transactions={available}
            categories={categories}
            total={total}
            page={page}
            pageSize={pageSize}
            locale={locale}
            timezone={timezone}
            searchInput={searchInput}
            onSearchInputChange={setSearchInput}
            onCategorize={handleCategorize}
            pageUrl={pageUrl}
          />
        </div>
      </div>
    </>
  );
}
