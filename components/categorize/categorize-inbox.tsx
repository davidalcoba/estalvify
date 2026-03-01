"use client";

import { useState, useTransition, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle,
  Search,
  Tag,
  Inbox,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Building2,
  Calendar,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  categorizeTransaction,
  bulkCategorizeByIds,
} from "@/app/(app)/categorize/actions";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface BankAccount { name: string }

interface Transaction {
  id: string;
  amount: { toString(): string };
  currency: string;
  direction: "DEBIT" | "CREDIT";
  bookingDate: Date;
  description: string | null;
  creditorName: string | null;
  debtorName: string | null;
  remittanceInfo?: string | null;
  bankAccount: BankAccount;
}

interface Category {
  id: string;
  name: string;
  color: string;
  parentId: string | null;
}

interface Props {
  transactions: Transaction[];
  categories: Category[];
  total: number;
  page: number;
  pageSize: number;
  pageSizeOptions: number[];
  locale: string;
  currency: string;
  timezone: string;
}

// ─────────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────────

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isMobile;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function txLabel(tx: Transaction) {
  return tx.description ?? (tx.direction === "CREDIT" ? tx.debtorName : tx.creditorName) ?? "Transaction";
}
function txCounterparty(tx: Transaction) {
  return tx.direction === "CREDIT" ? tx.debtorName : tx.creditorName;
}
function fmtAmount(tx: Transaction, locale: string) {
  return Number(tx.amount.toString()).toLocaleString(locale, {
    style: "currency",
    currency: tx.currency,
  });
}
function fmtDateShort(date: Date, locale: string, timezone: string) {
  return date.toLocaleDateString(locale, { timeZone: timezone, day: "numeric", month: "short" });
}
function fmtDateLong(date: Date, locale: string, timezone: string) {
  return date.toLocaleDateString(locale, {
    timeZone: timezone,
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
function matchesSearch(tx: Transaction, q: string) {
  const lower = q.toLowerCase();
  return [tx.description, tx.creditorName, tx.debtorName, tx.remittanceInfo]
    .some((f) => f?.toLowerCase().includes(lower));
}

// ─────────────────────────────────────────────
// Category options
// ─────────────────────────────────────────────

function CategoryOptions({ categories }: { categories: Category[] }) {
  const parents = categories.filter((c) => !c.parentId);
  const childrenMap: Record<string, Category[]> = {};
  for (const c of categories) {
    if (c.parentId) { childrenMap[c.parentId] ??= []; childrenMap[c.parentId].push(c); }
  }
  return (
    <>
      {parents.map((parent) => {
        const children = childrenMap[parent.id] ?? [];
        if (children.length === 0)
          return <option key={parent.id} value={parent.id}>{parent.name}</option>;
        return (
          <optgroup key={parent.id} label={parent.name}>
            {children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </optgroup>
        );
      })}
    </>
  );
}

// ─────────────────────────────────────────────
// Focus modal — shared state + desktop content
// ─────────────────────────────────────────────

interface FocusModalProps {
  snapshot: Transaction[];
  startIndex: number;
  categories: Category[];
  locale: string;
  timezone: string;
  isMobile: boolean;
  onClose: () => void;
  onCategorized: (txId: string) => void;
  onReverted: (txId: string) => void;
}

function FocusModal({
  snapshot,
  startIndex,
  categories,
  locale,
  timezone,
  isMobile,
  onClose,
  onCategorized,
  onReverted,
}: FocusModalProps) {
  const [queue, setQueue] = useState<Transaction[]>(snapshot);
  const [index, setIndex] = useState(Math.min(startIndex, Math.max(0, snapshot.length - 1)));
  const [isPending, startTransition] = useTransition();

  const current = queue[index] ?? null;
  const categorizedCount = snapshot.length - queue.length;
  const done = queue.length === 0;

  function handleCategorySelect(categoryId: string) {
    if (!categoryId || !current || isPending) return;
    const txId = current.id;
    const tx = current;
    const newQueue = queue.filter((q) => q.id !== txId);
    setQueue(newQueue);
    setIndex((i) => Math.min(i, Math.max(0, newQueue.length - 1)));
    onCategorized(txId);
    startTransition(async () => {
      try {
        await categorizeTransaction(txId, categoryId);
      } catch {
        onReverted(txId);
        setQueue((q) => { const next = [...q]; next.splice(Math.min(index, next.length), 0, tx); return next; });
      }
    });
  }

  const goPrev = () => setIndex((i) => Math.max(0, i - 1));
  const goNext = () => setIndex((i) => Math.min(queue.length - 1, i + 1));

  // ── Mobile: full-screen bottom sheet ─────────

  if (isMobile) {
    const isCredit = current?.direction === "CREDIT";
    const label = current ? txLabel(current) : "";
    const counterparty = current ? txCounterparty(current) : null;

    return (
      <Sheet open onOpenChange={(open) => !open && onClose()}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="h-[100dvh] gap-0 flex flex-col rounded-none p-0"
        >
          {/* ── Top bar ── */}
          <div className="flex items-center justify-between px-5 pt-10 pb-4 shrink-0">
            <SheetTitle className="text-sm font-medium text-muted-foreground tabular-nums">
              {done ? "Done!" : `${index + 1} / ${queue.length}`}
              {categorizedCount > 0 && !done && (
                <span className="ml-2 text-green-600 font-semibold">✓ {categorizedCount}</span>
              )}
            </SheetTitle>
            <button
              onClick={onClose}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-muted hover:bg-muted/80 transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          </div>

          {/* ── Content ── */}
          {done ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-5 px-8 text-center">
              <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle className="h-10 w-10 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">All done!</p>
                <p className="text-muted-foreground mt-1">
                  {categorizedCount} transaction{categorizedCount !== 1 ? "s" : ""} categorized.
                </p>
              </div>
              <Button className="w-full h-14 text-base mt-2" onClick={onClose}>
                Close
              </Button>
            </div>
          ) : current ? (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Transaction info — takes the upper portion */}
              <div className="flex-1 flex flex-col items-center justify-center text-center px-8 gap-3">
                {/* Direction icon */}
                <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
                  isCredit
                    ? "bg-green-100 text-green-600 dark:bg-green-900/30"
                    : "bg-red-100 text-red-500 dark:bg-red-900/30"
                }`}>
                  {isCredit
                    ? <ArrowDownLeft className="h-8 w-8" />
                    : <ArrowUpRight className="h-8 w-8" />}
                </div>

                {/* Amount */}
                <p className={`text-5xl font-black tabular-nums tracking-tight ${
                  isCredit ? "text-green-600" : ""
                }`}>
                  {isCredit ? "+" : "−"}{fmtAmount(current, locale)}
                </p>

                {/* Description */}
                <p className="text-2xl font-bold leading-tight">{label}</p>

                {/* Counterparty */}
                {counterparty && counterparty !== label && (
                  <p className="text-lg text-muted-foreground">{counterparty}</p>
                )}

                {/* Meta */}
                <div className="flex flex-col items-center gap-0.5 text-sm text-muted-foreground">
                  <span>{current.bankAccount.name}</span>
                  <span>{fmtDateLong(current.bookingDate, locale, timezone)}</span>
                  {current.remittanceInfo && (
                    <span className="text-xs text-muted-foreground/60 max-w-xs truncate">
                      {current.remittanceInfo}
                    </span>
                  )}
                </div>
              </div>

              {/* Controls — fixed at the bottom */}
              <div
                className="shrink-0 px-5 pb-6 pt-4 space-y-3 border-t bg-background"
                style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
              >
                {/* Category picker */}
                <select
                  key={current.id}
                  defaultValue=""
                  onChange={(e) => handleCategorySelect(e.target.value)}
                  disabled={isPending}
                  className="w-full h-16 rounded-2xl border-2 border-input bg-background px-4 text-lg font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 appearance-none"
                  style={{ fontSize: "18px" }}
                >
                  <option value="" disabled>
                    {isPending ? "Saving…" : "Pick a category…"}
                  </option>
                  <CategoryOptions categories={categories} />
                </select>

                {/* Prev / Next */}
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1 h-14 text-base gap-1"
                    onClick={goPrev}
                    disabled={index === 0}
                  >
                    <ChevronLeft className="h-5 w-5" /> Prev
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 h-14 text-base gap-1"
                    onClick={goNext}
                    disabled={index >= queue.length - 1}
                  >
                    Next <ChevronRight className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    );
  }

  // ── Desktop: compact centered dialog ─────────

  const counter = done
    ? "Done!"
    : `${index + 1} / ${queue.length}${categorizedCount > 0 ? ` · ✓ ${categorizedCount}` : ""}`;

  const isCredit = current?.direction === "CREDIT";
  const label = current ? txLabel(current) : "";
  const counterparty = current ? txCounterparty(current) : null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm p-0 gap-0 overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b">
          <DialogTitle className="text-sm font-medium text-muted-foreground">{counter}</DialogTitle>
        </div>

        {done ? (
          <div className="flex flex-col items-center gap-3 py-10 px-5 text-center">
            <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="font-semibold">Page done!</p>
              <p className="text-sm text-muted-foreground">
                {categorizedCount} transaction{categorizedCount !== 1 ? "s" : ""} categorized.
              </p>
            </div>
          </div>
        ) : current ? (
          <div className="px-5 py-4 space-y-4">
            {/* Transaction card */}
            <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                  isCredit
                    ? "bg-green-100 text-green-600 dark:bg-green-900/30"
                    : "bg-red-100 text-red-500 dark:bg-red-900/30"
                }`}>
                  {isCredit ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                </div>
                <p className={`text-2xl font-bold tabular-nums ${isCredit ? "text-green-600" : ""}`}>
                  {isCredit ? "+" : "−"}{fmtAmount(current, locale)}
                </p>
              </div>
              <div>
                <p className="font-semibold leading-tight">{label}</p>
                {counterparty && counterparty !== label && (
                  <p className="text-sm text-muted-foreground mt-0.5">{counterparty}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground pt-2 border-t">
                <span className="flex items-center gap-1">
                  <Building2 className="h-3 w-3" />{current.bankAccount.name}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />{fmtDateLong(current.bookingDate, locale, timezone)}
                </span>
                {current.remittanceInfo && (
                  <span className="w-full truncate text-muted-foreground/60">{current.remittanceInfo}</span>
                )}
              </div>
            </div>

            <select
              key={current.id}
              defaultValue=""
              onChange={(e) => handleCategorySelect(e.target.value)}
              disabled={isPending}
              className="w-full h-11 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
            >
              <option value="" disabled>{isPending ? "Saving…" : "Pick a category…"}</option>
              <CategoryOptions categories={categories} />
            </select>

            <div className="flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={goPrev} disabled={index === 0}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Prev
              </Button>
              <Button variant="ghost" size="sm" onClick={goNext} disabled={index >= queue.length - 1}>
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────

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
  const isMobile = useIsMobile();

  const [searchInput, setSearchInput] = useState("");
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [bulkCategoryId, setBulkCategoryId] = useState("");
  const [isBulking, setIsBulking] = useState(false);
  const [categorizedIds, setCategorizedIds] = useState<Set<string>>(new Set());
  const [focusState, setFocusState] = useState<{ snapshot: Transaction[]; index: number } | null>(null);

  // Derived
  const available = transactions.filter((tx) => !categorizedIds.has(tx.id));
  const filtered = searchInput.trim()
    ? available.filter((tx) => matchesSearch(tx, searchInput.trim()))
    : available;

  const checkedVisible = filtered.filter((tx) => checkedIds.has(tx.id));
  const allChecked = filtered.length > 0 && checkedVisible.length === filtered.length;
  const someChecked = checkedVisible.length > 0 && !allChecked;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  // ── Handlers ────────────────────────────────

  function toggleCheck(txId: string, e: React.MouseEvent) {
    e.stopPropagation();
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(txId)) next.delete(txId); else next.add(txId);
      return next;
    });
  }

  function toggleAll(e: React.MouseEvent) {
    e.stopPropagation();
    setCheckedIds(allChecked || someChecked ? new Set() : new Set(filtered.map((tx) => tx.id)));
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
      setCategorizedIds((prev) => { const next = new Set(prev); ids.forEach((id) => next.delete(id)); return next; });
    } finally {
      setIsBulking(false);
    }
  }

  function handleCategorize(txId: string, categoryId: string, e?: React.SyntheticEvent) {
    e?.stopPropagation();
    if (!categoryId) return;
    setCategorizedIds((prev) => new Set([...prev, txId]));
    startTransition(async () => {
      try {
        await categorizeTransaction(txId, categoryId);
      } catch {
        setCategorizedIds((prev) => { const next = new Set(prev); next.delete(txId); return next; });
      }
    });
  }

  const handleFocusCategorized = useCallback((txId: string) => {
    setCategorizedIds((prev) => new Set([...prev, txId]));
  }, []);

  const handleFocusReverted = useCallback((txId: string) => {
    setCategorizedIds((prev) => { const next = new Set(prev); next.delete(txId); return next; });
  }, []);

  function handlePageSizeChange(newSize: number) {
    startTransition(() => router.push(`/categorize?size=${newSize}`));
  }

  function pageUrl(p: number) {
    return `/categorize?page=${p}&size=${pageSize}`;
  }

  // ── Empty states ─────────────────────────────

  const allCaughtUp = total === 0 && categorizedIds.size === 0;
  const noResults = filtered.length === 0 && available.length > 0 && searchInput.trim().length > 0;

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────

  return (
    <>
      {focusState && (
        <FocusModal
          snapshot={focusState.snapshot}
          startIndex={focusState.index}
          categories={categories}
          locale={locale}
          timezone={timezone}
          isMobile={isMobile}
          onClose={() => setFocusState(null)}
          onCategorized={handleFocusCategorized}
          onReverted={handleFocusReverted}
        />
      )}

      <div className="space-y-4 max-w-3xl mx-auto px-4 sm:px-0">
        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Categorize</h2>
            <p className="text-muted-foreground text-sm hidden sm:block">
              Classify transactions to get accurate reports.
            </p>
          </div>
          {total > 0 && (
            <Badge variant="secondary" className="mt-0.5 shrink-0 font-semibold">
              {total} pending
            </Badge>
          )}
        </div>

        {/* ── Search ── */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            type="search"
            placeholder="Filter transactions…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9 h-11 sm:h-10"
          />
        </div>

        {/* ── Bulk bar ── */}
        {checkedVisible.length > 0 && categories.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950/30 px-3 py-2.5">
            <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300 w-full sm:w-auto">
              {checkedVisible.length} selected
            </span>
            <div className="flex flex-1 items-center gap-2 min-w-0">
              <select
                value={bulkCategoryId}
                onChange={(e) => setBulkCategoryId(e.target.value)}
                className="flex-1 min-w-0 h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="" disabled>Categorize as…</option>
                <CategoryOptions categories={categories} />
              </select>
              <Button
                size="sm"
                onClick={handleBulkApply}
                disabled={!bulkCategoryId || isBulking}
                className="bg-indigo-600 hover:bg-indigo-700 shrink-0 h-9"
              >
                {isBulking ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCheckedIds(new Set())}
                className="shrink-0 text-muted-foreground h-9"
              >
                Clear
              </Button>
            </div>
          </div>
        )}

        {/* ── All caught up ── */}
        {allCaughtUp && (
          <Card className="border-dashed">
            <div className="flex flex-col items-center gap-3 py-12 text-center px-4">
              <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
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

        {/* ── No filter results ── */}
        {noResults && (
          <Card className="border-dashed">
            <div className="flex flex-col items-center gap-3 py-10 text-center px-4">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <Inbox className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="font-semibold">No matches</p>
              <p className="text-sm text-muted-foreground">
                No transactions match &quot;{searchInput}&quot;.
              </p>
              <Button variant="outline" size="sm" onClick={() => setSearchInput("")}>
                Clear filter
              </Button>
            </div>
          </Card>
        )}

        {/* ── List ── */}
        {filtered.length > 0 && (
          <>
            {/* Controls: range + page size + pagination */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <p className="text-xs text-muted-foreground truncate">
                  {searchInput.trim()
                    ? `${filtered.length} of ${available.length} loaded`
                    : `${rangeStart}–${rangeEnd} of ${total}`}
                </p>
                <select
                  value={pageSize}
                  onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                  className="h-6 rounded border border-input bg-background px-1 text-xs text-muted-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {pageSizeOptions.map((s) => (
                    <option key={s} value={s}>{s}/p</option>
                  ))}
                </select>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="outline" size="sm" asChild={page > 1} className="h-7 w-7 p-0" disabled={page <= 1}>
                    {page > 1 ? <a href={pageUrl(page - 1)}><ChevronLeft className="h-3.5 w-3.5" /></a> : <ChevronLeft className="h-3.5 w-3.5" />}
                  </Button>
                  <span className="text-xs px-1.5 tabular-nums text-muted-foreground">{page}/{totalPages}</span>
                  <Button variant="outline" size="sm" asChild={page < totalPages} className="h-7 w-7 p-0" disabled={page >= totalPages}>
                    {page < totalPages ? <a href={pageUrl(page + 1)}><ChevronRight className="h-3.5 w-3.5" /></a> : <ChevronRight className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              )}
            </div>

            {/* Transaction table */}
            <Card>
              <CardContent className="p-0">
                <div className="divide-y">

                  {/* Select-all header */}
                  <div
                    className="flex items-center h-10 px-0 bg-muted/20 cursor-pointer"
                    onClick={toggleAll}
                  >
                    <div className="w-12 sm:w-11 flex items-center justify-center shrink-0">
                      <input
                        type="checkbox"
                        checked={allChecked}
                        ref={(el) => { if (el) el.indeterminate = someChecked; }}
                        onChange={() => {}}
                        onClick={(e) => e.stopPropagation()}
                        className="h-4 w-4 rounded border-gray-300 accent-indigo-600 pointer-events-none"
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {someChecked || allChecked ? `${checkedVisible.length} selected` : "Select all"}
                    </span>
                  </div>

                  {/* Rows */}
                  {filtered.map((tx, i) => {
                    const isCredit = tx.direction === "CREDIT";
                    const label = txLabel(tx);
                    const counterparty = txCounterparty(tx);
                    const checked = checkedIds.has(tx.id);

                    return (
                      <div
                        key={tx.id}
                        className={`flex items-stretch transition-colors ${
                          checked ? "bg-indigo-50 dark:bg-indigo-950/20" : ""
                        }`}
                      >
                        {/* ── ZONE 1: Checkbox strip — full-height tap target ── */}
                        <div
                          className={`w-12 sm:w-11 flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
                            checked
                              ? "hover:bg-indigo-100 dark:hover:bg-indigo-950/30"
                              : "hover:bg-muted/50"
                          }`}
                          onClick={(e) => toggleCheck(tx.id, e)}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {}}
                            onClick={(e) => e.stopPropagation()}
                            className="h-4 w-4 rounded border-gray-300 accent-indigo-600 pointer-events-none"
                          />
                        </div>

                        {/* ── ZONE 2: Content — opens focus modal on tap ── */}
                        <div
                          className="flex-1 flex items-center gap-2 sm:gap-3 pr-3 sm:pr-4 py-3.5 sm:py-3 cursor-pointer hover:bg-muted/30 transition-colors min-w-0"
                          onClick={() => setFocusState({ snapshot: filtered, index: i })}
                        >
                          {/* Direction icon */}
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                            isCredit
                              ? "bg-green-100 text-green-600 dark:bg-green-900/30"
                              : "bg-red-100 text-red-500 dark:bg-red-900/30"
                          }`}>
                            {isCredit
                              ? <ArrowDownLeft className="h-4 w-4" />
                              : <ArrowUpRight className="h-4 w-4" />}
                          </div>

                          {/* Description */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{label}</p>
                            {/* Desktop: counterparty + bank + date */}
                            <p className="text-xs text-muted-foreground truncate hidden sm:block">
                              {counterparty && counterparty !== label ? `${counterparty} · ` : ""}
                              {tx.bankAccount.name} · {fmtDateShort(tx.bookingDate, locale, timezone)}
                            </p>
                            {/* Mobile: date only */}
                            <p className="text-xs text-muted-foreground sm:hidden">
                              {fmtDateShort(tx.bookingDate, locale, timezone)}
                            </p>
                          </div>

                          {/* Amount */}
                          <p className={`text-sm font-semibold tabular-nums shrink-0 ${
                            isCredit ? "text-green-600" : "text-foreground"
                          }`}>
                            {isCredit ? "+" : "−"}{fmtAmount(tx, locale)}
                          </p>

                          {/* Inline category select — desktop only */}
                          <select
                            value=""
                            onChange={(e) => { if (e.target.value) handleCategorize(tx.id, e.target.value, e); }}
                            onClick={(e) => e.stopPropagation()}
                            className="hidden sm:block h-8 max-w-40 min-w-32 rounded-md border border-input bg-background px-2 text-xs text-muted-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer shrink-0"
                            aria-label={`Categorize: ${label}`}
                          >
                            <option value="" disabled>Category…</option>
                            <CategoryOptions categories={categories} />
                          </select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Bottom pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{rangeStart}–{rangeEnd} of {total}</p>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" asChild={page > 1} className="h-8 w-8 p-0" disabled={page <= 1}>
                    {page > 1 ? <a href={pageUrl(page - 1)}><ChevronLeft className="h-3.5 w-3.5" /></a> : <ChevronLeft className="h-3.5 w-3.5" />}
                  </Button>
                  <span className="text-xs px-2 tabular-nums text-muted-foreground">{page}/{totalPages}</span>
                  <Button variant="outline" size="sm" asChild={page < totalPages} className="h-8 w-8 p-0" disabled={page >= totalPages}>
                    {page < totalPages ? <a href={pageUrl(page + 1)}><ChevronRight className="h-3.5 w-3.5" /></a> : <ChevronRight className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Page done ── */}
        {filtered.length === 0 && !allCaughtUp && !noResults && categorizedIds.size > 0 && (
          <Card className="border-dashed">
            <div className="flex flex-col items-center gap-3 py-10 text-center px-4">
              <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="font-semibold">Page done!</p>
                {page < totalPages && (
                  <p className="text-sm text-muted-foreground mt-1">Continue with the next page.</p>
                )}
              </div>
              {page < totalPages && (
                <Button asChild><a href={pageUrl(page + 1)}>Next page</a></Button>
              )}
            </div>
          </Card>
        )}

        {/* ── No categories ── */}
        {categories.length === 0 && total > 0 && (
          <Card className="border-dashed border-amber-200 bg-amber-50 dark:bg-amber-950/20">
            <div className="flex flex-col items-center gap-2 py-8 text-center px-4">
              <Tag className="h-6 w-6 text-amber-600" />
              <p className="text-sm font-medium">No categories yet</p>
              <p className="text-xs text-muted-foreground">
                Go to{" "}
                <a href="/settings" className="underline underline-offset-2">Settings</a>{" "}
                to create your categories first.
              </p>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
