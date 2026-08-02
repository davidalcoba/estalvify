"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { type Category } from "@/components/categorize/category-options";
import { CategorySelect } from "@/components/categorize/category-select";
import { CategorizeDesktopView } from "@/components/categorize/views/categorize-desktop-view";
import { CategorizeMobileView } from "@/components/categorize/views/categorize-mobile-view";
import { TransactionDetailCard } from "@/components/transactions/shared/transaction-detail-card";
import { QuickRuleDialog } from "@/components/rules/quick-rule-dialog";
import { type TransactionListItemDTO } from "@/lib/transactions/transaction-dto";
import {
  bulkCategorize,
  bulkCategorizeByIds,
  categorizeTransaction,
} from "@/app/(app)/categorize/actions";
import { useCategorizeSearch } from "@/components/categorize/search-context";
import { matchesTransactionSearch } from "@/lib/categorize";
import { useAction } from "@/lib/use-action";

interface Props {
  transactions: TransactionListItemDTO[];
  categories: Category[];
  total: number;
  page: number;
  pageSize: number;
  pageSizeOptions: number[];
  locale: string;
  dateLocale: string;
  timezone: string;
}

interface FocusModalProps {
  snapshot: TransactionListItemDTO[];
  startIndex: number;
  categories: Category[];
  locale: string;
  dateLocale: string;
  timezone: string;
  onClose: () => void;
  onCategorized: (txId: string) => void;
  onReverted: (txId: string) => void;
}



function FocusModal({
  snapshot,
  startIndex,
  categories,
  locale,
  dateLocale,
  timezone,
  onClose,
  onCategorized,
  onReverted,
}: FocusModalProps) {
  const [queue, setQueue] = useState<TransactionListItemDTO[]>(snapshot);
  const [index, setIndex] = useState(Math.min(startIndex, Math.max(0, snapshot.length - 1)));
  const { run, pending: saving } = useAction();
  const [ruleOpen, setRuleOpen] = useState(false);

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

    // Deliberately not awaited: the queue has already advanced, so the user
    // keeps classifying while this one saves in the background.
    run(txId, async () => {
      try {
        await categorizeTransaction(txId, categoryId);
      } catch {
        onReverted(txId);
        setQueue((prev) => {
          const next = [...prev];
          next.splice(Math.min(index, next.length), 0, currentTx);
          return next;
        });
      }
    });
  }

  return (
    <>
    {ruleOpen && current && (
      <QuickRuleDialog
        open={ruleOpen}
        onClose={() => setRuleOpen(false)}
        transaction={current}
        categories={categories}
        mode="dialog"
        onSuccess={() => {
          onCategorized(current.id);
          const newQueue = queue.filter((tx) => tx.id !== current.id);
          setQueue(newQueue);
          setIndex((i) => Math.min(i, Math.max(0, newQueue.length - 1)));
        }}
      />
    )}
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[min(96vw,640px)] max-h-[85vh] pt-8 px-6 pb-6 gap-0 overflow-hidden">
        <DialogTitle className="sr-only">Categorize transaction queue</DialogTitle>

        {/* Saves run in the background while the queue advances — this is the
            only sign they are still in flight. */}
        {saving && (
          <Loader2
            className="absolute top-4 right-11 size-4 animate-spin text-muted-foreground"
            role="status"
            aria-label="Saving"
          />
        )}

        <div className="space-y-4 overflow-y-auto pr-2">
          {done ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-success" />
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
              <TransactionDetailCard transaction={current} locale={locale} dateLocale={dateLocale} timezone={timezone} />

              <div className="flex items-center gap-2">
                <CategorySelect
                  key={current.id}
                  value=""
                  onValueChange={handleCategorySelect}
                  categories={categories}
                  ariaLabel="Pick a category"
                  className="flex-1 h-10"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 shrink-0 text-warning border-warning/30 hover:bg-warning/10"
                  onClick={() => setRuleOpen(true)}
                  title="Create rule for this transaction"
                >
                  <Zap className="h-4 w-4" />
                </Button>
              </div>

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
    </>
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
  dateLocale,
  timezone,
}: Props) {
  const router = useRouter();
  const { run, busy } = useAction();

  const { searchInput, setSearchInput } = useCategorizeSearch();
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [bulkCategoryId, setBulkCategoryId] = useState("");
  const [bulkQueryCategoryId, setBulkQueryCategoryId] = useState("");
  const [categorizedIds, setCategorizedIds] = useState<Set<string>>(new Set());
  // Only one bulk bar is ever on screen, so a single flag drives both.
  const isBulking = busy("bulk-selected") || busy("bulk-query");
  const [focusState, setFocusState] = useState<{ snapshot: TransactionListItemDTO[]; index: number } | null>(null);

  const available = useMemo(
    () => transactions.filter((tx) => !categorizedIds.has(tx.id)),
    [transactions, categorizedIds]
  );

  const filtered = useMemo(() => {
    const query = searchInput.trim();
    if (query.length < 3) return available;
    return available.filter((tx) => matchesTransactionSearch(tx, query));
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

  function handleBulkApply() {
    if (!bulkCategoryId || checkedVisible.length === 0) return;

    const ids = checkedVisible.map((tx) => tx.id);
    const categoryId = bulkCategoryId;
    setCategorizedIds((prev) => new Set([...prev, ...ids]));
    setCheckedIds(new Set());
    setBulkCategoryId("");

    run("bulk-selected", async () => {
      try {
        await bulkCategorizeByIds(ids, categoryId);
      } catch {
        setCategorizedIds((prev) => {
          const next = new Set(prev);
          ids.forEach((id) => next.delete(id));
          return next;
        });
      }
    });
  }

  function handleBulkByQuery() {
    const query = searchInput.trim();
    if (!bulkQueryCategoryId || query.length < 3) return;

    const categoryId = bulkQueryCategoryId;
    const visibleIds = filtered.map((tx) => tx.id);
    setCategorizedIds((prev) => new Set([...prev, ...visibleIds]));
    setBulkQueryCategoryId("");

    run("bulk-query", async () => {
      try {
        await bulkCategorize(query, categoryId);
        router.refresh();
      } catch {
        setCategorizedIds((prev) => {
          const next = new Set(prev);
          visibleIds.forEach((id) => next.delete(id));
          return next;
        });
      }
    });
  }

  function handleCategorize(txId: string, categoryId: string) {
    if (!categoryId) return;

    setCategorizedIds((prev) => new Set([...prev, txId]));

    run(txId, async () => {
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
    // A navigation, not a write — but it stalls the page just the same, so it
    // goes through the same runner and moves the top bar.
    run("page-size", () => {
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
          dateLocale={dateLocale}
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
            dateLocale={dateLocale}
            timezone={timezone}
            searchInput={searchInput}
            onSearchInputChange={setSearchInput}
            checkedIds={checkedIds}
            bulkCategoryId={bulkCategoryId}
            bulkQueryCategoryId={bulkQueryCategoryId}
            isBulking={isBulking}
            onBulkCategoryChange={setBulkCategoryId}
            onBulkQueryCategoryChange={setBulkQueryCategoryId}
            onBulkApply={handleBulkApply}
            onBulkByQuery={handleBulkByQuery}
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
            pageSizeOptions={pageSizeOptions}
            locale={locale}
            dateLocale={dateLocale}
            timezone={timezone}
            searchInput={searchInput}
            onSearchInputChange={setSearchInput}
            onCategorize={handleCategorize}
            pageUrl={pageUrl}
            onPageSizeChange={handlePageSizeChange}
            isBulking={isBulking}
            bulkQueryCategoryId={bulkQueryCategoryId}
            onBulkQueryCategoryChange={setBulkQueryCategoryId}
            onBulkByQuery={handleBulkByQuery}
            checkedIds={checkedIds}
            bulkCategoryId={bulkCategoryId}
            onBulkCategoryChange={setBulkCategoryId}
            onBulkApply={handleBulkApply}
            onClearSelection={() => setCheckedIds(new Set())}
            onToggleCheck={toggleCheck}
            onToggleAll={toggleAll}
          />
        </div>
      </div>
    </>
  );
}
