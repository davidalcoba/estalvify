"use client";

// Upcoming charges: the plannedItems list — series instances and one-offs in
// ONE list, ordered by date — with an add dialog for one-offs (this year's
// IBI) and delete for hand-typed entries. Series instances point at /recurring.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Plus, Repeat, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { type Category } from "@/components/categorize/category-options";
import { CategorySelect } from "@/components/categorize/category-select";
import { formatCurrency, formatDate } from "@/lib/formatters";
import {
  createPlannedOneOff,
  deletePlannedOneOff,
} from "@/app/(app)/plan/actions";

export interface PlannedRowVM {
  id: string;
  description: string;
  direction: "DEBIT" | "CREDIT";
  amount: number;
  date: string; // resolved YYYY-MM-DD (window start for charges)
  windowLabel: string | null; // "1–6" for windows, null for exact days
  status: "PENDING" | "MATCHED" | "MISSED";
  matchedAmount: number | null;
  fromSeries: boolean;
  accountName: string | null;
}

interface PlannedListProps {
  rows: PlannedRowVM[];
  categories: Category[];
  currency: string;
  locale: string;
  dateLocale: string;
  defaultYear: number;
  defaultMonth: number;
}

const STATUS_BADGE: Record<PlannedRowVM["status"], { label: string; variant: "success-soft" | "warning-soft" | "secondary" }> = {
  MATCHED: { label: "Matched", variant: "success-soft" },
  MISSED: { label: "Missed", variant: "warning-soft" },
  PENDING: { label: "Pending", variant: "secondary" },
};

export function PlannedList({
  rows,
  categories,
  currency,
  locale,
  dateLocale,
  defaultYear,
  defaultMonth,
}: PlannedListProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    description: "",
    categoryId: null as string | null,
    amount: "",
    year: String(defaultYear),
    month: String(defaultMonth),
    dueDay: "",
  });

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        await createPlannedOneOff({
          description: draft.description,
          categoryId: draft.categoryId,
          amount: Number(draft.amount),
          year: Number(draft.year),
          month: Number(draft.month),
          dueDay: draft.dueDay ? Number(draft.dueDay) : null,
        });
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save");
      }
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      try {
        await deletePlannedOneOff(id);
        router.refresh();
      } catch {
        // refresh restores truth
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Upcoming charges</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)} disabled={isPending}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          One-off
        </Button>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing planned ahead. Recurring series generate entries here
            automatically — maintain them in{" "}
            <Link href="/recurring" className="text-brand underline-offset-2 hover:underline">
              Recurring
            </Link>
            ; add one-offs (this year&apos;s IBI) with the button above.
          </p>
        ) : (
          <ul className="divide-y">
            {rows.map((row) => {
              const badge = STATUS_BADGE[row.status];
              return (
                <li key={row.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    {row.fromSeries && (
                      <Repeat className="mr-1.5 inline size-3.5 text-muted-foreground" aria-label="From a recurring series" />
                    )}
                    {row.description}
                    {row.accountName && (
                      <span className="ml-2 text-xs text-muted-foreground">{row.accountName}</span>
                    )}
                  </span>
                  <Badge variant={badge.variant} className="shrink-0 text-xs">
                    {badge.label}
                  </Badge>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatDate(row.date, dateLocale, "UTC", { day: "numeric", month: "short" })}
                    {row.windowLabel ? ` (${row.windowLabel})` : ""}
                  </span>
                  <span
                    className={`w-24 shrink-0 text-right tabular-nums ${
                      row.direction === "CREDIT" ? "text-success" : ""
                    }`}
                  >
                    {row.direction === "CREDIT" ? "+" : "−"}
                    {formatCurrency(row.matchedAmount ?? row.amount, currency, locale)}
                  </span>
                  {!row.fromSeries && row.status === "PENDING" ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground"
                      onClick={() => remove(row.id)}
                      disabled={isPending}
                      title="Delete one-off"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  ) : (
                    <span className="w-7 shrink-0" />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[min(96vw,440px)] pt-8 px-6 pb-6">
          <DialogTitle>One-off planned charge</DialogTitle>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="po-desc">Description</Label>
              <Input
                id="po-desc"
                placeholder="IBI Palafrugell 2026"
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <CategorySelect
                defaultValue={draft.categoryId ?? undefined}
                onValueChange={(v) => setDraft({ ...draft, categoryId: v || null })}
                categories={categories}
                ariaLabel="One-off category"
                className="w-full"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="po-amount">Amount</Label>
                <Input
                  id="po-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={draft.amount}
                  onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="po-month">Month</Label>
                <Input
                  id="po-month"
                  type="number"
                  min="1"
                  max="12"
                  value={draft.month}
                  onChange={(e) => setDraft({ ...draft, month: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="po-year">Year</Label>
                <Input
                  id="po-year"
                  type="number"
                  value={draft.year}
                  onChange={(e) => setDraft({ ...draft, year: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="po-day">Day (optional)</Label>
              <Input
                id="po-day"
                type="number"
                min="1"
                max="31"
                placeholder="Any day of the month"
                value={draft.dueDay}
                onChange={(e) => setDraft({ ...draft, dueDay: e.target.value })}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
                Cancel
              </Button>
              <Button onClick={save} disabled={isPending}>
                {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
