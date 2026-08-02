"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Target, TrendingUp, TrendingDown, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency } from "@/lib/formatters";
import { useAction } from "@/lib/use-action";
import type { CategoryOption, PlanData, PlanEntryVM } from "@/lib/plan/plan-dto";
import type { PlanItemFields } from "@/app/(app)/plan/actions";
import { createPlanItem, updatePlanItem, deletePlanItem } from "@/app/(app)/plan/actions";
import { PlanItemDialog, type PlanDialogTarget } from "./plan-item-dialog";
import { PlanEntryRow } from "./shared/plan-entry-row";
import { PlanCategoryCard } from "./shared/plan-category-card";

interface PlanViewProps {
  data: PlanData;
  categories: CategoryOption[];
  locale: string;
  currency: string;
  dateLocale: string;
}

export function PlanView({ data, categories, locale, currency, dateLocale }: PlanViewProps) {
  const router = useRouter();
  const { run, pending, busy } = useAction();
  const [target, setTarget] = useState<PlanDialogTarget | null>(null);

  const isEmpty = data.income.length === 0 && data.expenseGroups.length === 0;
  const { totals } = data;

  function openAddIncome() {
    setTarget({ mode: "add", direction: "CREDIT" });
  }
  function openAddExpense(categoryId?: string) {
    setTarget({ mode: "add", direction: "DEBIT", categoryId });
  }
  function openEdit(entry: PlanEntryVM) {
    setTarget({ mode: "edit", direction: entry.direction, item: entry });
  }

  function handleSubmit(fields: PlanItemFields) {
    run("save", async () => {
      try {
        if (target?.mode === "edit" && target.item) {
          await updatePlanItem(target.item.id, { ...fields, currency });
        } else {
          await createPlanItem({ ...fields, currency });
        }
        setTarget(null);
        router.refresh();
      } catch {
        // Leave the dialog open so the user can retry.
      }
    });
  }

  function handleDelete(entry: PlanEntryVM) {
    run(`delete:${entry.id}`, async () => {
      try {
        await deletePlanItem(entry.id);
        router.refresh();
      } catch {
        // no-op — a refresh will restore the true state
      }
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Plan"
        actions={
          !isEmpty ? (
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={openAddIncome} disabled={pending}>
                <Plus className="mr-2 h-4 w-4" />
                Income
              </Button>
              <Button onClick={() => openAddExpense()} disabled={pending || categories.length === 0}>
                <Plus className="mr-2 h-4 w-4" />
                Expense
              </Button>
            </div>
          ) : undefined
        }
      />

      {isEmpty ? (
        <EmptyState
          icon={Target}
          title="Plan your income and expenses"
          description="Add what you expect to earn and spend, with any frequency. This drives your forecast and category limits."
        >
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button onClick={openAddIncome}>
              <Plus className="mr-2 h-4 w-4" />
              Add income
            </Button>
            <Button variant="outline" onClick={() => openAddExpense()} disabled={categories.length === 0}>
              <Plus className="mr-2 h-4 w-4" />
              Add expense
            </Button>
          </div>
        </EmptyState>
      ) : (
        <>
          {/* Monthly summary — the goal: am I planning to save? */}
          <div className="grid gap-4 sm:grid-cols-3">
            <SummaryTile
              title="Expected income"
              icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
            >
              <span className="text-success">{formatCurrency(totals.monthlyIncome, currency, locale)}</span>
            </SummaryTile>
            <SummaryTile
              title="Expected expenses"
              icon={<TrendingDown className="h-4 w-4 text-muted-foreground" />}
            >
              {formatCurrency(totals.monthlyExpenses, currency, locale)}
            </SummaryTile>
            <SummaryTile
              title="Monthly net"
              icon={<Wallet className="h-4 w-4 text-muted-foreground" />}
            >
              <span className={totals.monthlyNet >= 0 ? "text-success" : "text-destructive"}>
                {totals.monthlyNet >= 0 ? "+" : "−"}
                {formatCurrency(Math.abs(totals.monthlyNet), currency, locale)}
              </span>
            </SummaryTile>
          </div>

          {/* Expected income */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Expected income</CardTitle>
              <Button variant="ghost" size="sm" onClick={openAddIncome} disabled={pending}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add
              </Button>
            </CardHeader>
            <CardContent>
              {data.income.length > 0 ? (
                <div className="divide-y">
                  {data.income.map((entry) => (
                    <PlanEntryRow
                      key={entry.id}
                      entry={entry}
                      currency={currency}
                      locale={locale}
                      dateLocale={dateLocale}
                      onEdit={openEdit}
                      onDelete={handleDelete}
                      deleting={busy(`delete:${entry.id}`)}
                      disabled={pending}
                    />
                  ))}
                </div>
              ) : (
                <p className="py-2 text-sm text-muted-foreground">
                  No income planned yet.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Planned spending by category */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Planned spending</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => openAddExpense()}
                disabled={pending || categories.length === 0}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add expense
              </Button>
            </div>
            {data.expenseGroups.length > 0 ? (
              <div className="space-y-3">
                {data.expenseGroups.map((group) => (
                  <PlanCategoryCard
                    key={group.categoryId}
                    group={group}
                    currency={currency}
                    locale={locale}
                    dateLocale={dateLocale}
                    onAdd={openAddExpense}
                    onEdit={openEdit}
                    onDelete={handleDelete}
                    isDeleting={(entry) => busy(`delete:${entry.id}`)}
                    disabled={pending}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No expenses planned yet.</p>
            )}
          </div>
        </>
      )}

      <PlanItemDialog
        target={target}
        categories={categories}
        onClose={() => setTarget(null)}
        onSubmit={handleSubmit}
        pending={busy("save")}
      />
    </div>
  );
}

function SummaryTile({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tabular-nums">{children}</div>
      </CardContent>
    </Card>
  );
}
