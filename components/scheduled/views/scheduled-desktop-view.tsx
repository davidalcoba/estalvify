"use client";

import { ArrowDownLeft, ArrowUpRight, MoreHorizontal, Pause, Play, Pencil, Trash2 } from "lucide-react";
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
import { useTransition } from "react";
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

interface ScheduledDesktopViewProps {
  transactions: ScheduledTransactionDTO[];
  locale: string;
  timezone: string;
  currency: string;
  onEdit: (tx: ScheduledTransactionDTO) => void;
}

export function ScheduledDesktopView({
  transactions,
  locale,
  timezone,
  currency,
  onEdit,
}: ScheduledDesktopViewProps) {
  return (
    <div className="rounded-lg border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40">
            <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Payee</th>
            <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Category</th>
            <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Account</th>
            <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">Amount</th>
            <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Next date</th>
            <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Repeats</th>
            <th className="py-2.5 px-4 w-10" />
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx) => (
            <ScheduledRow
              key={tx.id}
              tx={tx}
              locale={locale}
              timezone={timezone}
              currency={currency}
              onEdit={onEdit}
            />
          ))}
        </tbody>
      </table>

      {transactions.length === 0 && (
        <div className="py-12 text-center text-muted-foreground text-sm">
          No scheduled transactions yet.
        </div>
      )}
    </div>
  );
}

interface ScheduledRowProps {
  tx: ScheduledTransactionDTO;
  locale: string;
  timezone: string;
  currency: string;
  onEdit: (tx: ScheduledTransactionDTO) => void;
}

function ScheduledRow({ tx, locale, timezone, currency, onEdit }: ScheduledRowProps) {
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
    <tr className={`border-b last:border-0 hover:bg-muted/20 ${!tx.isActive ? "opacity-50" : ""}`}>
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
              tx.direction === "CREDIT"
                ? "bg-green-100 text-green-600"
                : "bg-red-100 text-red-500"
            }`}
          >
            {tx.direction === "CREDIT" ? (
              <ArrowDownLeft className="h-3 w-3" />
            ) : (
              <ArrowUpRight className="h-3 w-3" />
            )}
          </div>
          <span className="font-medium">{tx.payeeName}</span>
          {!tx.isActive && (
            <Badge variant="secondary" className="text-xs">Paused</Badge>
          )}
        </div>
      </td>
      <td className="py-3 px-4 text-muted-foreground">
        {tx.categoryId ? (
          <span className="flex items-center gap-1.5">
            {tx.categoryColor && (
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ background: tx.categoryColor }}
              />
            )}
            {tx.categoryName}
          </span>
        ) : (
          <span className="text-green-700 text-xs font-medium">Ready to Assign</span>
        )}
      </td>
      <td className="py-3 px-4 text-muted-foreground text-xs">{tx.bankAccountName}</td>
      <td className="py-3 px-4 text-right">
        <span
          className={`font-medium ${
            tx.direction === "CREDIT" ? "text-green-700" : "text-foreground"
          }`}
        >
          {tx.direction === "CREDIT" ? "+" : "−"}
          {formatCurrency(tx.amount, currency, locale)}
        </span>
      </td>
      <td className="py-3 px-4 text-muted-foreground">
        {formatDate(tx.nextDate, locale, timezone, { day: "numeric", month: "short", year: "numeric" })}
      </td>
      <td className="py-3 px-4 text-muted-foreground text-xs">
        {REPEAT_LABELS[tx.repeatRule]}
        {tx.repeatRule === "CUSTOM" && tx.repeatInterval ? ` (${tx.repeatInterval}d)` : ""}
      </td>
      <td className="py-3 px-4">
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
      </td>
    </tr>
  );
}
