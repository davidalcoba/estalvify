"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  PiggyBank,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { BudgetSummary } from "@/components/budget/shared/budget-summary";
import { UnbudgetedList } from "@/components/budget/shared/unbudgeted-list";
import {
  BudgetCategoryDialog,
  type BudgetDialogTarget,
} from "@/components/budget/shared/budget-category-dialog";
import { BudgetDesktopView } from "@/components/budget/views/budget-desktop-view";
import { BudgetMobileView } from "@/components/budget/views/budget-mobile-view";
import type { BudgetData, CategoryOption, UnbudgetedRow } from "@/lib/budget/budget-dto";
import type { BudgetRow } from "@/lib/budget/budget-progress";
import {
  saveBudgetItem,
  removeBudgetItem,
  copyPreviousMonthBudget,
} from "@/app/(app)/budget/actions";

interface BudgetViewProps {
  data: BudgetData;
  categories: CategoryOption[];
  monthLabel: string;
  prevHref: string;
  nextHref: string;
  hasPreviousBudget: boolean;
  locale: string;
  currency: string;
}

export function BudgetView({
  data,
  categories,
  monthLabel,
  prevHref,
  nextHref,
  hasPreviousBudget,
  locale,
  currency,
}: BudgetViewProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [target, setTarget] = useState<BudgetDialogTarget | null>(null);

  const { year, month } = data;
  const hasRows = data.rows.length > 0;

  // Categories not yet budgeted — the pool the "add" dialog can pick from.
  const budgetedIds = useMemo(
    () => new Set(data.rows.map((r) => r.categoryId)),
    [data.rows]
  );
  const addableCategories = useMemo(
    () => categories.filter((c) => !budgetedIds.has(c.id)),
    [categories, budgetedIds]
  );

  function openAdd() {
    setTarget({ mode: "add" });
  }

  function openEdit(row: BudgetRow) {
    setTarget({
      mode: "edit",
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      amount: row.planned,
    });
  }

  function openBudgetUnbudgeted(row: UnbudgetedRow) {
    // Pre-fill the dialog with the category and the amount already spent.
    setTarget({
      mode: "add",
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      amount: Math.round(row.spent * 100) / 100,
    });
  }

  function handleSubmit(categoryId: string, amount: number) {
    startTransition(async () => {
      try {
        await saveBudgetItem({ year, month, categoryId, plannedAmount: amount, currency });
        setTarget(null);
        router.refresh();
      } catch {
        // Leave the dialog open so the user can retry.
      }
    });
  }

  function handleRemove(row: BudgetRow) {
    startTransition(async () => {
      try {
        await removeBudgetItem({ year, month, categoryId: row.categoryId });
        router.refresh();
      } catch {
        // no-op — a refresh will restore the true state
      }
    });
  }

  function handleCopyPrevious() {
    startTransition(async () => {
      try {
        await copyPreviousMonthBudget({ year, month });
        router.refresh();
      } catch {
        // no-op
      }
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Budget"
        description="Plan where your money goes each month, and track it against real spending."
        actions={
          // Only in the header when there are rows — the empty state hosts its
          // own CTAs, so this avoids duplicate "Add category" buttons.
          hasRows ? (
            <div className="flex items-center gap-2">
              {hasPreviousBudget && (
                <Button variant="outline" onClick={handleCopyPrevious} disabled={pending}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy last month
                </Button>
              )}
              <Button onClick={openAdd} disabled={pending || addableCategories.length === 0}>
                <Plus className="mr-2 h-4 w-4" />
                Add category
              </Button>
            </div>
          ) : undefined
        }
      />

      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link href={prevHref} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Link>
        </Button>
        <span className="text-sm font-medium capitalize">{monthLabel}</span>
        <Button variant="ghost" size="sm" asChild>
          <Link href={nextHref} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      {hasRows ? (
        <>
          <BudgetSummary totals={data.totals} currency={currency} locale={locale} />

          <div className="hidden md:block">
            <BudgetDesktopView
              rows={data.rows}
              unbudgeted={data.unbudgeted}
              currency={currency}
              locale={locale}
              onEdit={openEdit}
              onRemove={handleRemove}
              onBudgetUnbudgeted={openBudgetUnbudgeted}
              disabled={pending}
            />
          </div>
          <div className="md:hidden">
            <BudgetMobileView
              rows={data.rows}
              unbudgeted={data.unbudgeted}
              currency={currency}
              locale={locale}
              onEdit={openEdit}
              onRemove={handleRemove}
              onBudgetUnbudgeted={openBudgetUnbudgeted}
              disabled={pending}
            />
          </div>
        </>
      ) : (
        <>
          <EmptyState
            icon={PiggyBank}
            title="No budget for this month yet"
            description="Set a planned amount per category and track it against your real spending. Start from scratch or copy last month's plan."
          >
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button onClick={openAdd} disabled={addableCategories.length === 0}>
                <Plus className="mr-2 h-4 w-4" />
                Add category
              </Button>
              {hasPreviousBudget && (
                <Button variant="outline" onClick={handleCopyPrevious} disabled={pending}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy last month
                </Button>
              )}
            </div>
          </EmptyState>

          {data.unbudgeted.length > 0 && (
            <UnbudgetedList
              rows={data.unbudgeted}
              currency={currency}
              locale={locale}
              onBudget={openBudgetUnbudgeted}
              disabled={pending}
            />
          )}
        </>
      )}

      <BudgetCategoryDialog
        target={target}
        categories={addableCategories}
        onClose={() => setTarget(null)}
        onSubmit={handleSubmit}
        pending={pending}
      />
    </div>
  );
}
