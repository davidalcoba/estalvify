"use client";

import { ArrowDownLeft, ArrowUpRight, MoreHorizontal, Pause, Play, Pencil, Trash2 } from "lucide-react";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/formatters";
import type { ScheduledTransactionDTO, RepeatRule } from "@/lib/scheduled/scheduled-dto";
import {
  toggleScheduledTransaction,
  deleteScheduledTransaction,
} from "@/app/(app)/scheduled/actions";

const REPEAT_LABELS: Record<RepeatRule, string> = {
  NONE: "One time",
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  YEARLY: "Yearly",
  CUSTOM: "Custom",
};

interface ScheduledMobileViewProps {
  transactions: ScheduledTransactionDTO[];
  locale: string;
  timezone: string;
  currency: string;
  onEdit: (tx: ScheduledTransactionDTO) => void;
}

export function ScheduledMobileView({
  transactions,
  locale,
  timezone,
  currency,
  onEdit,
}: ScheduledMobileViewProps) {
  if (transactions.length === 0) {
    return (
      <div className="text-center text-muted-foreground text-sm py-10">
        No scheduled transactions yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {transactions.map((tx) => (
        <ScheduledCard
          key={tx.id}
          tx={tx}
          locale={locale}
          timezone={timezone}
          currency={currency}
          onEdit={onEdit}
        />
      ))}
    </div>
  );
}

interface ScheduledCardProps {
  tx: ScheduledTransactionDTO;
  locale: string;
  timezone: string;
  currency: string;
  onEdit: (tx: ScheduledTransactionDTO) => void;
}

function ScheduledCard({ tx, locale, timezone, currency, onEdit }: ScheduledCardProps) {
  const [, startTransition] = useTransition();

  function handleToggle() {
    startTransition(async () => {
      await toggleScheduledTransaction(tx.id);
    });
  }

  function handleDelete() {
    if (!confirm(`Delete "${tx.payeeName}"?`)) return;
    startTransition(async () => {
      await deleteScheduledTransaction(tx.id);
    });
  }

  return (
    <div className={`rounded-xl border bg-card p-4 ${!tx.isActive ? "opacity-50" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
              tx.direction === "CREDIT"
                ? "bg-green-100 text-green-600"
                : "bg-red-100 text-red-500"
            }`}
          >
            {tx.direction === "CREDIT" ? (
              <ArrowDownLeft className="h-4 w-4" />
            ) : (
              <ArrowUpRight className="h-4 w-4" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-medium text-sm">{tx.payeeName}</span>
              {!tx.isActive && (
                <Badge variant="secondary" className="text-xs">Paused</Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {tx.categoryId ? (
                <span className="flex items-center gap-1">
                  {tx.categoryColor && (
                    <span
                      className="inline-block w-1.5 h-1.5 rounded-full"
                      style={{ background: tx.categoryColor }}
                    />
                  )}
                  {tx.categoryName}
                </span>
              ) : (
                <span className="text-green-700">Ready to Assign</span>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {formatDate(tx.nextDate, locale, timezone, {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}{" "}
              · {REPEAT_LABELS[tx.repeatRule]}
              {tx.repeatRule === "CUSTOM" && tx.repeatInterval ? ` (${tx.repeatInterval}d)` : ""}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <span
            className={`text-sm font-semibold ${
              tx.direction === "CREDIT" ? "text-green-700" : ""
            }`}
          >
            {tx.direction === "CREDIT" ? "+" : "−"}
            {formatCurrency(tx.amount, currency, locale)}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(tx)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleToggle}>
                {tx.isActive ? (
                  <>
                    <Pause className="mr-2 h-4 w-4" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" />
                    Resume
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleDelete}
                className="text-red-600 focus:text-red-600"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
