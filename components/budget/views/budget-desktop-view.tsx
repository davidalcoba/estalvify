"use client";

import { ChevronLeft, ChevronRight, Target, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/formatters";
import type { BudgetMonthDTO, BudgetCategoryDTO } from "@/lib/budget/budget-dto";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface BudgetDesktopViewProps {
  data: BudgetMonthDTO;
  locale: string;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onAssign: (category: BudgetCategoryDTO) => void;
  onSetTarget: (category: BudgetCategoryDTO) => void;
}

export function BudgetDesktopView({
  data,
  locale,
  onPrevMonth,
  onNextMonth,
  onAssign,
  onSetTarget,
}: BudgetDesktopViewProps) {
  const { year, month, readyToAssign, currency, categoryGroups } = data;

  return (
    <div className="space-y-4">
      {/* Header: month nav + Ready to Assign */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={onPrevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-base font-semibold min-w-[140px] text-center">
            {MONTH_NAMES[month - 1]} {year}
          </span>
          <Button variant="outline" size="icon" onClick={onNextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div
          className={`flex items-center gap-3 rounded-lg border px-4 py-2 ${
            readyToAssign < 0
              ? "border-red-300 bg-red-50"
              : readyToAssign === 0
              ? "border-border bg-muted/30"
              : "border-green-300 bg-green-50"
          }`}
        >
          <div className="text-sm text-muted-foreground">Ready to Assign</div>
          <div
            className={`text-lg font-bold ${
              readyToAssign < 0
                ? "text-red-600"
                : readyToAssign === 0
                ? "text-foreground"
                : "text-green-700"
            }`}
          >
            {formatCurrency(readyToAssign, currency, locale)}
          </div>
        </div>
      </div>

      {readyToAssign < 0 && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">
          You have assigned more than available. Reduce assignments to bring Ready to Assign back to zero.
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">
                Category
              </th>
              <th className="text-right py-2.5 px-4 font-medium text-muted-foreground w-36">
                Assigned
              </th>
              <th className="text-right py-2.5 px-4 font-medium text-muted-foreground w-32">
                Activity
              </th>
              <th className="text-right py-2.5 px-4 font-medium text-muted-foreground w-32">
                Available
              </th>
            </tr>
          </thead>
          <tbody>
            {categoryGroups.map((group) => (
              <>
                {/* Group header row */}
                <tr
                  key={`group-${group.groupId ?? group.groupName}`}
                  className="border-b bg-muted/20"
                >
                  <td className="py-2 px-4 font-semibold text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: group.groupColor }}
                    />
                    {group.groupName}
                  </td>
                  <td className="text-right py-2 px-4 text-xs text-muted-foreground">
                    {formatCurrency(group.assignedTotal, currency, locale)}
                  </td>
                  <td className="text-right py-2 px-4 text-xs text-muted-foreground">
                    {group.activityTotal !== 0
                      ? formatCurrency(-group.activityTotal, currency, locale)
                      : "—"}
                  </td>
                  <td
                    className={`text-right py-2 px-4 text-xs font-medium ${
                      group.availableTotal < 0 ? "text-red-600" : "text-muted-foreground"
                    }`}
                  >
                    {formatCurrency(group.availableTotal, currency, locale)}
                  </td>
                </tr>

                {/* Category rows */}
                {group.categories.map((cat) => (
                  <CategoryRow
                    key={cat.categoryId}
                    category={cat}
                    currency={currency}
                    locale={locale}
                    onAssign={onAssign}
                    onSetTarget={onSetTarget}
                  />
                ))}
              </>
            ))}
          </tbody>
        </table>

        {categoryGroups.length === 0 && (
          <div className="py-12 text-center text-muted-foreground text-sm">
            No categories available. Add categories in Settings.
          </div>
        )}
      </div>
    </div>
  );
}

interface CategoryRowProps {
  category: BudgetCategoryDTO;
  currency: string;
  locale: string;
  onAssign: (category: BudgetCategoryDTO) => void;
  onSetTarget: (category: BudgetCategoryDTO) => void;
}

function CategoryRow({ category, currency, locale, onAssign, onSetTarget }: CategoryRowProps) {
  const isOverspent = category.available < 0;
  const hasTarget = !!category.target;
  const isTargetMet =
    hasTarget &&
    category.assigned >= (category.target?.suggestedAmount ?? 0) &&
    category.target!.suggestedAmount > 0;

  return (
    <tr className="border-b last:border-0 hover:bg-muted/20 group">
      <td className="py-2.5 px-4">
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-2 h-2 rounded-full shrink-0"
            style={{ background: category.categoryColor }}
          />
          <span>{category.categoryName}</span>
          {hasTarget && (
            <span
              className={`text-xs px-1.5 py-0.5 rounded-full ${
                isTargetMet
                  ? "bg-green-100 text-green-700"
                  : "bg-amber-100 text-amber-700"
              }`}
            >
              {isTargetMet ? "✓" : formatCurrency(category.target!.suggestedAmount, currency, locale)}
            </span>
          )}
        </div>
      </td>

      {/* Assigned — click to assign */}
      <td className="text-right py-2.5 px-4">
        <button
          onClick={() => onAssign(category)}
          className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-indigo-50 hover:text-indigo-700 transition-colors group/assign"
        >
          <span className="font-medium">
            {formatCurrency(category.assigned, currency, locale)}
          </span>
          <Pencil className="h-3 w-3 opacity-0 group-hover/assign:opacity-100 transition-opacity" />
        </button>
      </td>

      <td className="text-right py-2.5 px-4 text-muted-foreground">
        {category.activity !== 0
          ? formatCurrency(-category.activity, currency, locale)
          : "—"}
      </td>

      <td className={`text-right py-2.5 px-4 font-medium ${isOverspent ? "text-red-600" : ""}`}>
        <div className="flex items-center justify-end gap-1">
          {formatCurrency(category.available, currency, locale)}
          <button
            onClick={() => onSetTarget(category)}
            className="opacity-0 group-hover:opacity-100 transition-opacity ml-1"
            title="Set target"
          >
            <Target className="h-3.5 w-3.5 text-muted-foreground hover:text-indigo-600" />
          </button>
        </div>
      </td>
    </tr>
  );
}
