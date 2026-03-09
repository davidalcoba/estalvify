"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, ChevronLeft, ChevronRight, CreditCard, Loader2, Tag, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { TransactionItem } from "@/components/transactions/shared/transaction-item";
import { TransactionPagination } from "@/components/transactions/shared/transaction-pagination";
import { TransactionAmount } from "@/components/transactions/shared/transaction-amount";
import { CategoryChip } from "@/components/transactions/shared/category-chip";
import { CategoryOptions, type Category } from "@/components/categorize/category-options";
import { QuickRuleDialog } from "@/components/rules/quick-rule-dialog";
import { categorizeTransaction } from "@/app/(app)/categorize/actions";
import {
  transactionMerchant,
  transactionOperationType,
  type TransactionListItemDTO,
} from "@/lib/transactions/transaction-dto";

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
  categories: Category[];
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

function formatLongDate(dateIso: string, locale: string, timezone: string) {
  return new Date(dateIso).toLocaleDateString(locale, {
    timeZone: timezone,
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
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
  categories,
}: TransactionsMobileViewProps) {
  const router = useRouter();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [ruleOpen, setRuleOpen] = useState(false);

  const flatTransactions = useMemo(
    () => groupedTransactions.flatMap((g) => g.items),
    [groupedTransactions]
  );

  const activeTx = activeIndex !== null ? (flatTransactions[activeIndex] ?? null) : null;

  function openTx(tx: TransactionListItemDTO) {
    const idx = flatTransactions.findIndex((t) => t.id === tx.id);
    setActiveIndex(idx >= 0 ? idx : null);
  }

  function navigateTo(idx: number) {
    setRuleOpen(false);
    setActiveIndex(idx);
  }

  async function handleRecategorize(categoryId: string) {
    if (!categoryId || activeIndex === null || !activeTx) return;
    setSaving(true);
    try {
      await categorizeTransaction(activeTx.id, categoryId);
      router.refresh();
      if (activeIndex + 1 < flatTransactions.length) {
        setActiveIndex(activeIndex + 1);
      } else {
        setActiveIndex(null);
      }
    } finally {
      setSaving(false);
    }
  }

  function handleRuleSuccess() {
    setRuleOpen(false);
    router.refresh();
    if (activeIndex !== null && activeIndex + 1 < flatTransactions.length) {
      setActiveIndex(activeIndex + 1);
    } else {
      setActiveIndex(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {rangeStart}–{rangeEnd} of {total}
        </p>
        <TransactionPagination
          page={page}
          totalPages={totalPages}
          pageQuery={pageQuery}
          size="sm"
        />
      </div>

      {groupedTransactions.map(({ dateKey, items }) => (
        <section key={dateKey} className="space-y-2">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide px-1">
            {formatSectionDate(dateKey, userLocale, userTimezone)}
          </p>
          <div className="space-y-2">
            {items.map((tx) => (
              <Card
                key={tx.id}
                className="py-0 gap-0 overflow-hidden cursor-pointer active:opacity-80 transition-opacity"
              >
                <CardContent className="p-0">
                  <TransactionItem
                    tx={tx}
                    locale={userLocale}
                    dateText={formatMobileDate(tx.valueDate, userLocale, userTimezone)}
                    onClick={() => openTx(tx)}
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
          <TransactionPagination
            page={page}
            totalPages={totalPages}
            pageQuery={pageQuery}
            size="sm"
          />
        </div>
      )}

      {/* Transaction detail — bottom sheet on mobile */}
      <Sheet open={!!activeTx} onOpenChange={(open) => { if (!open) setActiveIndex(null); }}>
        <SheetContent side="bottom" className="rounded-t-xl pb-4" onOpenAutoFocus={(e) => e.preventDefault()}>
          {activeTx && (
            <>
              <SheetHeader className="pb-1">
                <SheetTitle className="text-base">{transactionMerchant(activeTx)}</SheetTitle>
                <p className="text-sm text-muted-foreground">{transactionOperationType(activeTx)}</p>
              </SheetHeader>

              <div className="px-4 space-y-4">
                <TransactionAmount
                  amount={activeTx.amount}
                  currency={activeTx.currency}
                  direction={activeTx.direction}
                  locale={userLocale}
                  className="text-2xl"
                />

                <div className="grid gap-2 text-sm">
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="h-4 w-4 shrink-0" />
                    {formatLongDate(activeTx.valueDate, userLocale, userTimezone)}
                  </p>
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <CreditCard className="h-4 w-4 shrink-0" />
                    {activeTx.bankAccount.name}
                  </p>
                  {activeTx.categoryName && (
                    <p className="flex items-center gap-2 text-muted-foreground">
                      <Tag className="h-4 w-4 shrink-0" />
                      <CategoryChip
                        name={activeTx.categoryName}
                        color={activeTx.categoryColor}
                      />
                    </p>
                  )}
                </div>

                {categories.length > 0 && (
                  <div className="flex items-center gap-2">
                    <select
                      key={activeTx.id}
                      defaultValue={activeTx.categoryId ?? ""}
                      onChange={(e) => { if (e.target.value) handleRecategorize(e.target.value); }}
                      disabled={saving}
                      className="flex-1 h-11 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none disabled:opacity-60"
                    >
                      <option value="" disabled>Pick a category…</option>
                      <CategoryOptions categories={categories} />
                    </select>
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin shrink-0 text-muted-foreground" />
                    ) : (
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
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => activeIndex !== null && navigateTo(activeIndex - 1)}
                    disabled={activeIndex === null || activeIndex === 0}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" /> Prev
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {activeIndex !== null ? activeIndex + 1 : 0} / {flatTransactions.length}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => activeIndex !== null && navigateTo(activeIndex + 1)}
                    disabled={activeIndex === null || activeIndex >= flatTransactions.length - 1}
                  >
                    Next <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {activeTx && ruleOpen && (
        <QuickRuleDialog
          open={ruleOpen}
          onClose={() => setRuleOpen(false)}
          transaction={activeTx}
          categories={categories}
          categoryId={activeTx.categoryId ?? ""}
          categoryName={activeTx.categoryName ?? ""}
          onSuccess={handleRuleSuccess}
        />
      )}
    </div>
  );
}
