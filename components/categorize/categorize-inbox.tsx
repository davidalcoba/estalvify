"use client";

import { useState, useRef, useTransition } from "react";
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
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { categorizeTransaction, bulkCategorize } from "@/app/(app)/categorize/actions";

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
  initialQuery: string;
  locale: string;
  currency: string;
  timezone: string;
}

// ─────────────────────────────────────────────
// Category select options (shared rendering)
// ─────────────────────────────────────────────

function CategoryOptions({ categories }: { categories: Category[] }) {
  const parents = categories.filter((c) => !c.parentId);
  const childrenMap: Record<string, Category[]> = {};
  for (const c of categories) {
    if (c.parentId) {
      if (!childrenMap[c.parentId]) childrenMap[c.parentId] = [];
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
// Main inbox component
// ─────────────────────────────────────────────

export function CategorizeInbox({
  transactions,
  categories,
  total,
  page,
  pageSize,
  initialQuery,
  locale,
  currency,
  timezone,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Local search input state (URL updated on debounce)
  const [searchInput, setSearchInput] = useState(initialQuery);

  // Optimistic: hide individually categorized rows immediately
  const [categorizedIds, setCategorizedIds] = useState<Set<string>>(new Set());

  // Bulk categorize controls
  const [bulkCategoryId, setBulkCategoryId] = useState("");
  const [isBulking, setIsBulking] = useState(false);

  const visibleTransactions = transactions.filter((tx) => !categorizedIds.has(tx.id));
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  // ── Search ──────────────────────────────────

  function handleSearchChange(value: string) {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const sp = new URLSearchParams();
      if (value.trim()) sp.set("q", value.trim());
      startTransition(() => router.push(`/categorize?${sp.toString()}`));
    }, 350);
  }

  function clearSearch() {
    setSearchInput("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    startTransition(() => router.push("/categorize"));
  }

  // ── Individual categorize ────────────────────

  function handleCategorize(txId: string, categoryId: string) {
    if (!categoryId) return;
    setCategorizedIds((prev) => new Set([...prev, txId]));
    startTransition(async () => {
      try {
        await categorizeTransaction(txId, categoryId);
      } catch {
        // Revert optimistic update on error
        setCategorizedIds((prev) => {
          const next = new Set(prev);
          next.delete(txId);
          return next;
        });
      }
    });
  }

  // ── Bulk categorize ──────────────────────────

  async function handleBulkCategorize() {
    if (!bulkCategoryId) return;
    setIsBulking(true);
    try {
      await bulkCategorize(searchInput.trim(), bulkCategoryId);
      setBulkCategoryId("");
      setSearchInput("");
      startTransition(() => router.push("/categorize"));
    } finally {
      setIsBulking(false);
    }
  }

  // ── Pagination URLs ──────────────────────────

  function pageUrl(p: number) {
    const sp = new URLSearchParams({ page: String(p) });
    if (searchInput.trim()) sp.set("q", searchInput.trim());
    return `/categorize?${sp.toString()}`;
  }

  // ── Formatters ───────────────────────────────

  function formatAmount(tx: Transaction) {
    return Number(tx.amount.toString()).toLocaleString(locale, {
      style: "currency",
      currency: tx.currency,
    });
  }

  function formatDate(date: Date) {
    return date.toLocaleDateString(locale, {
      timeZone: timezone,
      day: "numeric",
      month: "short",
    });
  }

  function txLabel(tx: Transaction) {
    const isCredit = tx.direction === "CREDIT";
    return tx.description ?? (isCredit ? tx.debtorName : tx.creditorName) ?? "Transacción";
  }

  function txCounterparty(tx: Transaction) {
    const isCredit = tx.direction === "CREDIT";
    return isCredit ? tx.debtorName : tx.creditorName;
  }

  // ── Empty states ─────────────────────────────

  const allCaughtUp =
    total === 0 && !searchInput.trim() && categorizedIds.size === 0;

  const noResults = total === 0 && searchInput.trim().length > 0;

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────

  return (
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

      {/* ── Search bar ── */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          type="search"
          placeholder="Search by description, merchant, reference…"
          value={searchInput}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="pl-9 pr-4"
        />
        {isPending && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
        )}
      </div>

      {/* ── Bulk action bar (visible when search is active) ── */}
      {searchInput.trim() && total > 0 && categories.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950/30 px-4 py-3">
          <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300 shrink-0">
            Categorize all {total} matches as:
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
            onClick={handleBulkCategorize}
            disabled={!bulkCategoryId || isBulking}
            className="bg-indigo-600 hover:bg-indigo-700 shrink-0"
          >
            {isBulking ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Apply to all"
            )}
          </Button>
          <Button variant="ghost" size="sm" onClick={clearSearch} className="shrink-0 text-muted-foreground">
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
                No transactions pending categorization. Connect your bank accounts
                and transactions will appear here after the next sync.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
              <Tag className="h-3.5 w-3.5" />
              <span>Transactions sync daily</span>
            </div>
          </div>
        </Card>
      )}

      {/* ── No results for search ── */}
      {noResults && (
        <Card className="border-dashed">
          <div className="flex flex-col items-center gap-3 py-10 text-center px-4">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <Inbox className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-semibold">No matches</p>
              <p className="text-sm text-muted-foreground mt-1">
                No uncategorized transactions match &quot;{searchInput}&quot;.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={clearSearch}>
              Clear search
            </Button>
          </div>
        </Card>
      )}

      {/* ── Transaction list ── */}
      {visibleTransactions.length > 0 && (
        <>
          {/* Range summary */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Showing {rangeStart}–{rangeEnd} of {total}
              {searchInput.trim() ? ` matching "${searchInput}"` : ""}
            </p>
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

          {/* Rows */}
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {visibleTransactions.map((tx) => {
                  const isCredit = tx.direction === "CREDIT";
                  const label = txLabel(tx);
                  const counterparty = txCounterparty(tx);

                  return (
                    <div
                      key={tx.id}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
                    >
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
                          {tx.bankAccount.name}
                          {" · "}
                          {formatDate(tx.bookingDate)}
                        </p>
                      </div>

                      {/* Amount */}
                      <p
                        className={`text-sm font-semibold tabular-nums shrink-0 ${
                          isCredit ? "text-green-600" : "text-foreground"
                        }`}
                      >
                        {isCredit ? "+" : "−"}
                        {formatAmount(tx)}
                      </p>

                      {/* Category picker */}
                      <select
                        value=""
                        onChange={(e) => {
                          if (e.target.value) handleCategorize(tx.id, e.target.value);
                        }}
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

      {/* ── All on this page categorized (but more pages remain) ── */}
      {visibleTransactions.length === 0 &&
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
                  All transactions on this page categorized.
                  {page < totalPages && " Continue with the next page."}
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
  );
}
