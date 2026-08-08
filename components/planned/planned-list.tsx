"use client";

// Upcoming charges: the plannedItems list — series instances and one-offs in
// ONE list, ordered by date — with an add dialog for one-offs (this year's
// IBI) and delete for hand-typed entries. Series instances point at /recurring.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Plus, Repeat, Trash2 } from "lucide-react";
import { useCanWrite } from "@/components/layout/role-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { type Category } from "@/components/categorize/category-options";
import { CategorySelect } from "@/components/categorize/category-select";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { useT } from "@/components/i18n/i18n-provider";
import { RichText } from "@/components/i18n/rich-text";
import type { MessageKey } from "@/lib/i18n/dictionaries/en";
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

const STATUS_BADGE: Record<
  PlannedRowVM["status"],
  { label: MessageKey; variant: "success-soft" | "warning-soft" | "secondary" }
> = {
  MATCHED: { label: "planned.status.MATCHED", variant: "success-soft" },
  MISSED: { label: "planned.status.MISSED", variant: "warning-soft" },
  PENDING: { label: "planned.status.PENDING", variant: "secondary" },
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
  const canWrite = useCanWrite();
  const t = useT();
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
    if (!draft.categoryId) {
      setError(t("planned.pickCategory"));
      return;
    }
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
        setError(err instanceof Error ? err.message : t("settings.saveFailed"));
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
        <CardTitle className="text-base">{t("planned.title")}</CardTitle>
        {canWrite && (
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)} disabled={isPending}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          {t("planned.oneOff")}
        </Button>
        )}
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            <RichText
              template={t("planned.empty")}
              slots={{
                link: (
                  <Link
                    href="/recurring"
                    className="text-brand underline-offset-2 hover:underline"
                  >
                    {t("nav.recurring")}
                  </Link>
                ),
              }}
            />
          </p>
        ) : (
          <ul className="divide-y">
            {rows.map((row) => {
              const badge = STATUS_BADGE[row.status];
              const when = `${formatDate(row.date, dateLocale, "UTC", { day: "numeric", month: "short" })}${row.windowLabel ? ` (${row.windowLabel})` : ""}`;
              const deletable = canWrite && !row.fromSeries && row.status === "PENDING";
              return (
                <li key={row.id} className="py-2.5 text-sm">
                  {/* The name owns the first line; status, date and the
                      delete affordance wrap below on mobile. */}
                  <div className="flex items-center gap-3">
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {row.fromSeries && (
                        <Repeat
                          className="mr-1.5 inline size-3.5 text-muted-foreground"
                          aria-label={t("planned.fromSeries")}
                        />
                      )}
                      {row.description}
                      {row.accountName && (
                        <span className="ml-2 hidden text-xs font-normal text-muted-foreground sm:inline">
                          {row.accountName}
                        </span>
                      )}
                    </span>
                    <Badge variant={badge.variant} className="hidden shrink-0 text-xs sm:inline-flex">
                      {t(badge.label)}
                    </Badge>
                    <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                      {when}
                    </span>
                    <span
                      className={`shrink-0 text-right tabular-nums sm:w-24 ${
                        row.direction === "CREDIT" ? "text-success" : ""
                      }`}
                    >
                      {row.direction === "CREDIT" ? "+" : "−"}
                      {formatCurrency(row.matchedAmount ?? row.amount, currency, locale)}
                    </span>
                    {deletable ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="hidden h-7 w-7 shrink-0 text-muted-foreground sm:inline-flex"
                        onClick={() => remove(row.id)}
                        disabled={isPending}
                        title={t("planned.deleteOneOff")}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    ) : (
                      <span className="hidden w-7 shrink-0 sm:inline" />
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs sm:hidden">
                    <Badge variant={badge.variant} className="shrink-0 text-xs">
                      {t(badge.label)}
                    </Badge>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {when}
                      {row.accountName ? ` · ${row.accountName}` : ""}
                    </span>
                    {deletable && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-muted-foreground"
                        onClick={() => remove(row.id)}
                        disabled={isPending}
                        title={t("planned.deleteOneOff")}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="pt-8 sm:w-[min(96vw,440px)] sm:max-w-[min(96vw,440px)]">
          <DialogTitle>{t("planned.dialog.title")}</DialogTitle>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="po-desc">{t("planned.dialog.description")}</Label>
              <Input
                id="po-desc"
                placeholder={t("planned.dialog.descriptionPlaceholder")}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("planned.dialog.category")}</Label>
              <CategorySelect
                defaultValue={draft.categoryId ?? undefined}
                onValueChange={(v) => setDraft({ ...draft, categoryId: v || null })}
                categories={categories}
                ariaLabel={t("planned.dialog.categoryAria")}
                className="w-full"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="po-amount">{t("planned.dialog.amount")}</Label>
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
                <Label htmlFor="po-month">{t("planned.dialog.month")}</Label>
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
                <Label htmlFor="po-year">{t("planned.dialog.year")}</Label>
                <Input
                  id="po-year"
                  type="number"
                  value={draft.year}
                  onChange={(e) => setDraft({ ...draft, year: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="po-day">{t("planned.dialog.day")}</Label>
              <Input
                id="po-day"
                type="number"
                min="1"
                max="31"
                placeholder={t("planned.dialog.dayPlaceholder")}
                value={draft.dueDay}
                onChange={(e) => setDraft({ ...draft, dueDay: e.target.value })}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
                {t("common.cancel")}
              </Button>
              <Button onClick={save} disabled={isPending}>
                {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {t("common.save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
