"use client";

import { useState, useTransition, useCallback } from "react";
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
  X,
  Building2,
  Calendar,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  categorizeTransaction,
  bulkCategorizeByIds,
} from "@/app/(app)/categorize/actions";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface BankAccount {
  name: string;
}

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
// Module-level helpers
// ─────────────────────────────────────────────

function txLabel(tx: Transaction): string {
  const isCredit = tx.direction === "CREDIT";
  return (
    tx.description ?? (isCredit ? tx.debtorName : tx.creditorName) ?? "Transaction"
  );
}

function txCounterparty(tx: Transaction): string | null {
  const isCredit = tx.direction === "CREDIT";
  return isCredit ? tx.debtorName : tx.creditorName;
}

function fmtAmount(tx: Transaction, locale: string): string {
  return Number(tx.amount.toString()).toLocaleString(locale, {
    style: "currency",
    currency: tx.currency,
  });
}

function fmtDate(date: Date, locale: string, timezone: string): string {
  return date.toLocaleDateString(locale, {
    timeZone: timezone,
    day: "numeric",
    month: "short",
  });
}

function fmtDateLong(date: Date, locale: string, timezone: string): string {
  return date.toLocaleDateString(locale, {
    timeZone: timezone,
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function matchesSearch(tx: Transaction, q: string): boolean {
  const lower = q.toLowerCase();
  return [tx.description, tx.creditorName, tx.debtorName, tx.remittanceInfo].some(
    (f) => f?.toLowerCase().includes(lower)
  );
}

// ─────────────────────────────────────────────
// Category select options
// ─────────────────────────────────────────────

function CategoryOptions({ categories }: { categories: Category[] }) {
  const parents = categories.filter((c) => !c.parentId);
  const childrenMap: Record<string, Category[]> = {};
  for (const c of categories) {
    if (c.parentId) {
      childrenMap[c.parentId] ??= [];
      childrenMap[c.parentId].push(c);
    }
  }
  return (
    <>
      {parents.map((parent) => {
        const children = childrenMap[parent.id] ?? [];
        if (children.length === 0) {
          return (
            <option key={parent.id} value={parent.id}>
              {parent.name}
            </option>
          );
        }
        return (
          <optgroup key={parent.id} label={parent.name}>
            {children.map((child) => (
              <option key={child.id} value={child.id}>
                {child.name}
              </option>
            ))}
          </optgroup>
        );
      })}
    </>
  );
}

// ─────────────────────────────────────────────
// Focus modal
// ─────────────────────────────────────────────

interface FocusModalProps {
  snapshot: Transaction[];
  startIndex: number;
  categories: Category[];
  locale: string;
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
  timezone,
  onClose,
  onCategorized,
  onReverted,
}: FocusModalProps) {
  const [queue, setQueue] = useState<Transaction[]>(snapshot);
  const [index, setIndex] = useState(Math.min(startIndex, snapshot.length - 1));
  const [isPending, startTransition] = useTransition();

  const current = queue[index] ?? null;
  const total = snapshot.length;
  const done = queue.length === 0;
  const categorizedCount = total - queue.length;

  function handleCategorySelect(categoryId: string) {
    if (!categoryId || !current || isPending) return;
    const txId = current.id;
    const tx = current;

    const newQueue = queue.filter((q) => q.id !== txId);
    const newIndex = Math.min(index, Math.max(0, newQueue.length - 1));
    setQueue(newQueue);
    setIndex(newIndex);
    onCategorized(txId);

    startTransition(async () => {
      try {
        await categorizeTransaction(txId, categoryId);
      } catch {
        onReverted(txId);
        setQueue((q) => {
          const next = [...q];
          next.splice(Math.min(index, next.length), 0, tx);
          return next;
        });
      }
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm p-0 gap-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b">
          <span className="text-sm text-muted-foreground tabular-nums">
            {done ? "All done!" : `${index + 1} / ${queue.length}`}
            {categorizedCount > 0 && !done && (
              <span className="ml-2 text-green-600 font-medium">
                ✓ {categorizedCount}
              </span>
            )}
          </span>
          <button
            onClick={onClose}
            className="rounded-sm opacity-70 hover:opacity-100 transition-opacity"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-4 space-y-4">
          {done ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
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
              {/* Transaction card */}
              <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      current.direction === "CREDIT"
                        ? "bg-green-100 text-green-600 dark:bg-green-900/30"
                        : "bg-red-100 text-red-500 dark:bg-red-900/30"
                    }`}
                  >
                    {current.direction === "CREDIT" ? (
                      <ArrowDownLeft className="h-4 w-4" />
                    ) : (
                      <ArrowUpRight className="h-4 w-4" />
                    )}
                  </div>
                  <p
                    className={`text-xl font-bold tabular-nums ${
                      current.direction === "CREDIT" ? "text-green-600" : ""
                    }`}
                  >
                    {current.direction === "CREDIT" ? "+" : "−"}
                    {fmtAmount(current, locale)}
                  </p>
                </div>

                <div>
                  <p className="font-semibold leading-tight">{txLabel(current)}</p>
                  {txCounterparty(current) &&
                    txCounterparty(current) !== txLabel(current) && (
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {txCounterparty(current)}
                      </p>
                    )}
                </div>

                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground pt-1 border-t">
                  <span className="flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    {current.bankAccount.name}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {fmtDateLong(current.bookingDate, locale, timezone)}
                  </span>
                  {current.remittanceInfo && (
                    <span className="w-full truncate text-muted-foreground/60">
                      {current.remittanceInfo}
                    </span>
                  )}
                </div>
              </div>

              {/* Category select — selecting auto-categorizes */}
              <select
                key={current.id}
                defaultValue=""
                onChange={(e) => handleCategorySelect(e.target.value)}
                disabled={isPending}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
              >
                <option value="" disabled>
                  {isPending ? "Saving…" : "Pick a category…"}
                </option>
                <CategoryOptions categories={categories} />
              </select>

              {/* Navigation */}
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

// ─────────────────────────────────────────────
// Main inbox component
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

  // Client-side search filter
  const [searchInput, setSearchInput] = useState("");

  // Checkbox selection for bulk
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [bulkCategoryId, setBulkCategoryId] = useState("");
  const [isBulking, setIsBulking] = useState(false);

  // Optimistic hide after categorization
  const [categorizedIds, setCategorizedIds] = useState<Set<string>>(new Set());

  // Focus modal: snapshot + starting index, null = closed
  const [focusState, setFocusState] = useState<{
    snapshot: Transaction[];
    index: number;
  } | null>(null);

  // Derived lists
  const available = transactions.filter((tx) => !categorizedIds.has(tx.id));
  const filtered = searchInput.trim()
    ? available.filter((tx) => matchesSearch(tx, searchInput.trim()))
    : available;

  const checkedVisible = filtered.filter((tx) => checkedIds.has(tx.id));
  const allChecked =
    filtered.length > 0 && checkedVisible.length === filtered.length;
  const someChecked = checkedVisible.length > 0 && !allChecked;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  // ── Checkboxes ───────────────────────────────

  function toggleCheck(txId: string, e: React.MouseEvent) {
    e.stopPropagation();
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(txId)) next.delete(txId);
      else next.add(txId);
      return next;
    });
  }

  function toggleAll(e: React.MouseEvent) {
    e.stopPropagation();
    if (allChecked || someChecked) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(filtered.map((tx) => tx.id)));
    }
  }

  // ── Bulk apply ───────────────────────────────

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

  // ── Individual categorize ────────────────────

  function handleCategorize(txId: string, categoryId: string, e?: React.SyntheticEvent) {
    e?.stopPropagation();
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

  // ── Focus modal callbacks ────────────────────

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

  // ── Page size + pagination ───────────────────

  function handlePageSizeChange(newSize: number) {
    const sp = new URLSearchParams({ size: String(newSize) });
    startTransition(() => router.push(`/categorize?${sp.toString()}`));
  }

  function pageUrl(p: number) {
    const sp = new URLSearchParams({ page: String(p), size: String(pageSize) });
    return `/categorize?${sp.toString()}`;
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
          onClose={() => setFocusState(null)}
          onCategorized={handleFocusCategorized}
          onReverted={handleFocusReverted}
        />
      )}

      <div className="space-y-4 max-w-3xl mx-auto">
        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Categorize</h2>
            <p className="text-muted-foreground text-sm">
              Classify transactions to get accurate reports.
            </p>
          </div>
          {total > 0 && (
            <Badge variant="secondary" className="mt-1 shrink-0 text-sm font-semibold">
              {total} pending
            </Badge>
          )}
        </div>

        {/* ── Search (client-side filter) ── */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            type="search"
            placeholder="Filter by description, merchant, reference…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9 pr-4"
          />
        </div>

        {/* ── Bulk action bar (visible when items are checked) ── */}
        {checkedVisible.length > 0 && categories.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950/30 px-4 py-3">
            <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300 shrink-0">
              {checkedVisible.length} selected — categorize as:
            </span>
            <select
              value={bulkCategoryId}
              onChange={(e) => setBulkCategoryId(e.target.value)}
              className="flex-1 min-w-40 h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="" disabled>
                Pick a category…
              </option>
              <CategoryOptions categories={categories} />
            </select>
            <Button
              size="sm"
              onClick={handleBulkApply}
              disabled={!bulkCategoryId || isBulking}
              className="bg-indigo-600 hover:bg-indigo-700 shrink-0"
            >
              {isBulking ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCheckedIds(new Set())}
              className="shrink-0 text-muted-foreground"
            >
              Clear
            </Button>
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

        {/* ── No filter results ── */}
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
              <Button variant="outline" size="sm" onClick={() => setSearchInput("")}>
                Clear filter
              </Button>
            </div>
          </Card>
        )}

        {/* ── Transaction list ── */}
        {filtered.length > 0 && (
          <>
            {/* Controls row: range + page-size + pagination */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <p className="text-xs text-muted-foreground">
                  {searchInput.trim()
                    ? `${filtered.length} of ${available.length} on this page`
                    : `${rangeStart}–${rangeEnd} of ${total}`}
                </p>
                <select
                  value={pageSize}
                  onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                  className="h-6 rounded border border-input bg-background px-1 text-xs text-muted-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {pageSizeOptions.map((s) => (
                    <option key={s} value={s}>
                      {s} / page
                    </option>
                  ))}
                </select>
              </div>
              {totalPages > 1 && (
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
              )}
            </div>

            {/* Table */}
            <Card>
              <CardContent className="p-0">
                <div className="divide-y">
                  {/* Select-all header row */}
                  <div className="flex items-center gap-3 px-4 py-2 bg-muted/20">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      ref={(el) => {
                        if (el) el.indeterminate = someChecked;
                      }}
                      onChange={() => {}}
                      onClick={toggleAll}
                      className="h-4 w-4 rounded border-gray-300 accent-indigo-600 cursor-pointer"
                    />
                    <span className="text-xs text-muted-foreground">
                      {someChecked || allChecked
                        ? `${checkedVisible.length} selected`
                        : "Select all"}
                    </span>
                  </div>

                  {/* Transaction rows */}
                  {filtered.map((tx, i) => {
                    const isCredit = tx.direction === "CREDIT";
                    const label = txLabel(tx);
                    const counterparty = txCounterparty(tx);
                    const checked = checkedIds.has(tx.id);

                    return (
                      <div
                        key={tx.id}
                        onClick={() => openFocus(i)}
                        className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                          checked
                            ? "bg-indigo-50 dark:bg-indigo-950/20 hover:bg-indigo-100 dark:hover:bg-indigo-950/30"
                            : "hover:bg-muted/30"
                        }`}
                      >
                        {/* Checkbox */}
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {}}
                          onClick={(e) => toggleCheck(tx.id, e)}
                          className="h-4 w-4 rounded border-gray-300 accent-indigo-600 cursor-pointer shrink-0"
                        />

                        {/* Direction icon */}
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                            isCredit
                              ? "bg-green-100 text-green-600 dark:bg-green-900/30"
                              : "bg-red-100 text-red-500 dark:bg-red-900/30"
                          }`}
                        >
                          {isCredit ? (
                            <ArrowDownLeft className="h-4 w-4" />
                          ) : (
                            <ArrowUpRight className="h-4 w-4" />
                          )}
                        </div>

                        {/* Description */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{label}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {counterparty && counterparty !== label
                              ? `${counterparty} · `
                              : ""}
                            {tx.bankAccount.name} · {fmtDate(tx.bookingDate, locale, timezone)}
                          </p>
                        </div>

                        {/* Amount */}
                        <p
                          className={`text-sm font-semibold tabular-nums shrink-0 ${
                            isCredit ? "text-green-600" : "text-foreground"
                          }`}
                        >
                          {isCredit ? "+" : "−"}
                          {fmtAmount(tx, locale)}
                        </p>

                        {/* Category picker (inline) */}
                        <select
                          value=""
                          onChange={(e) => {
                            if (e.target.value)
                              handleCategorize(tx.id, e.target.value, e);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="h-8 max-w-40 min-w-32 rounded-md border border-input bg-background px-2 text-xs text-muted-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer shrink-0"
                          aria-label={`Categorize: ${label}`}
                        >
                          <option value="" disabled>
                            Category…
                          </option>
                          <CategoryOptions categories={categories} />
                        </select>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Bottom pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-1">
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
            )}
          </>
        )}

        {/* ── Page done ── */}
        {filtered.length === 0 &&
          !allCaughtUp &&
          !noResults &&
          categorizedIds.size > 0 && (
            <Card className="border-dashed">
              <div className="flex flex-col items-center gap-3 py-10 text-center px-4">
                <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <CheckCircle className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="font-semibold">Page done!</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {page < totalPages && "Continue with the next page."}
                  </p>
                </div>
                {page < totalPages && (
                  <Button asChild>
                    <a href={pageUrl(page + 1)}>Next page</a>
                  </Button>
                )}
              </div>
            </Card>
          )}

        {/* ── No categories configured ── */}
        {categories.length === 0 && total > 0 && (
          <Card className="border-dashed border-amber-200 bg-amber-50 dark:bg-amber-950/20">
            <div className="flex flex-col items-center gap-2 py-8 text-center px-4">
              <Tag className="h-6 w-6 text-amber-600" />
              <p className="text-sm font-medium">No categories yet</p>
              <p className="text-xs text-muted-foreground">
                Go to{" "}
                <a href="/settings" className="underline underline-offset-2">
                  Settings
                </a>{" "}
                to create your categories first.
              </p>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
