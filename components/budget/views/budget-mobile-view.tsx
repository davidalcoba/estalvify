"use client";

import { ChevronLeft, ChevronRight, Target, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/formatters";
import type { BudgetMonthDTO, BudgetCategoryDTO, BudgetCategoryGroupDTO } from "@/lib/budget/budget-dto";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface BudgetMobileViewProps {
  data: BudgetMonthDTO;
  locale: string;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onAssign: (category: BudgetCategoryDTO) => void;
  onSetTarget: (category: BudgetCategoryDTO) => void;
}

export function BudgetMobileView({
  data,
  locale,
  onPrevMonth,
  onNextMonth,
  onAssign,
  onSetTarget,
}: BudgetMobileViewProps) {
  const { year, month, readyToAssign, currency, categoryGroups } = data;

  return (
    <div className="space-y-4">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="icon" onClick={onPrevMonth}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-base font-semibold">
          {MONTH_NAMES[month - 1]} {year}
        </span>
        <Button variant="outline" size="icon" onClick={onNextMonth}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Ready to Assign card */}
      <div
        className={`rounded-xl border p-4 ${
          readyToAssign < 0
            ? "border-red-300 bg-red-50"
            : readyToAssign === 0
            ? "border-border bg-muted/30"
            : "border-green-300 bg-green-50"
        }`}
      >
        <p className="text-xs text-muted-foreground mb-1">Ready to Assign</p>
        <p
          className={`text-2xl font-bold ${
            readyToAssign < 0
              ? "text-red-600"
              : readyToAssign === 0
              ? "text-foreground"
              : "text-green-700"
          }`}
        >
          {formatCurrency(readyToAssign, currency, locale)}
        </p>
        {readyToAssign < 0 && (
          <p className="text-xs text-red-600 mt-1">
            Over-assigned — reduce assignments to fix.
          </p>
        )}
        {readyToAssign > 0 && (
          <p className="text-xs text-green-700 mt-1">
            Assign this money to categories below.
          </p>
        )}
      </div>

      {/* Category groups */}
      <div className="space-y-2">
        {categoryGroups.map((group) => (
          <MobileCategoryGroup
            key={group.groupId ?? group.groupName}
            group={group}
            currency={currency}
            locale={locale}
            onAssign={onAssign}
            onSetTarget={onSetTarget}
          />
        ))}
      </div>

      {categoryGroups.length === 0 && (
        <div className="text-center text-muted-foreground text-sm py-8">
          No categories available. Add categories in Settings.
        </div>
      )}
    </div>
  );
}

interface MobileCategoryGroupProps {
  group: BudgetCategoryGroupDTO;
  currency: string;
  locale: string;
  onAssign: (category: BudgetCategoryDTO) => void;
  onSetTarget: (category: BudgetCategoryDTO) => void;
}

function MobileCategoryGroup({
  group,
  currency,
  locale,
  onAssign,
  onSetTarget,
}: MobileCategoryGroupProps) {
  const [expanded, setExpanded] = useState(true);
  const hasMultiple = group.categories.length > 1;

  return (
    <div className="rounded-xl border overflow-hidden">
      {/* Group header */}
      <button
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
            style={{ background: group.groupColor }}
          />
          <span className="font-medium text-sm">{group.groupName}</span>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`text-sm font-semibold ${
              group.availableTotal < 0 ? "text-red-600" : ""
            }`}
          >
            {formatCurrency(group.availableTotal, currency, locale)}
          </span>
          {hasMultiple &&
            (expanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ))}
        </div>
      </button>

      {/* Category cards */}
      {expanded && (
        <div className="divide-y">
          {group.categories.map((cat) => (
            <MobileCategoryCard
              key={cat.categoryId}
              category={cat}
              currency={currency}
              locale={locale}
              onAssign={onAssign}
              onSetTarget={onSetTarget}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface MobileCategoryCardProps {
  category: BudgetCategoryDTO;
  currency: string;
  locale: string;
  onAssign: (category: BudgetCategoryDTO) => void;
  onSetTarget: (category: BudgetCategoryDTO) => void;
}

function MobileCategoryCard({
  category,
  currency,
  locale,
  onAssign,
  onSetTarget,
}: MobileCategoryCardProps) {
  const isOverspent = category.available < 0;
  const hasTarget = !!category.target;
  const suggested = category.target?.suggestedAmount ?? 0;
  const isTargetMet = hasTarget && suggested > 0 && category.assigned >= suggested;

  return (
    <div className="px-4 py-3 bg-background">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block w-2 h-2 rounded-full shrink-0"
              style={{ background: category.categoryColor }}
            />
            <span className="text-sm font-medium truncate">{category.categoryName}</span>
            {hasTarget && (
              <span
                className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ${
                  isTargetMet
                    ? "bg-green-100 text-green-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {isTargetMet ? "✓" : formatCurrency(suggested, currency, locale)}
              </span>
            )}
          </div>

          <div className="flex gap-3 mt-1.5 text-xs text-muted-foreground">
            <span>
              Assigned:{" "}
              <button
                onClick={() => onAssign(category)}
                className="font-medium text-foreground underline underline-offset-2"
              >
                {formatCurrency(category.assigned, currency, locale)}
              </button>
            </span>
            {category.activity !== 0 && (
              <span>Spent: {formatCurrency(category.activity, currency, locale)}</span>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-1">
          <span
            className={`text-sm font-semibold ${isOverspent ? "text-red-600" : ""}`}
          >
            {formatCurrency(category.available, currency, locale)}
          </span>
          <button
            onClick={() => onSetTarget(category)}
            className="text-muted-foreground"
            title="Set target"
          >
            <Target className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
