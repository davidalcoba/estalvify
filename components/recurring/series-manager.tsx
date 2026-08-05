"use client";

// Manual CRUD over the recurring-series registry. No detection: at n=1,
// configuring fifteen known series is cheaper than inferring them. Each series
// generates dated planned items forward; the matcher text is what links the
// bank's arrivals back to it.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Repeat, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SimpleSelect } from "@/components/ui/simple-select";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { type Category } from "@/components/categorize/category-options";
import { CategorySelect } from "@/components/categorize/category-select";
import { formatCurrency } from "@/lib/formatters";
import {
  createSeries,
  updateSeries,
  deleteSeries,
  type SeriesFields,
} from "@/app/(app)/recurring/actions";

export interface SeriesVM {
  id: string;
  displayName: string;
  matcher: string;
  direction: "DEBIT" | "CREDIT";
  categoryId: string | null;
  bankAccountId: string | null;
  cadence: SeriesFields["cadence"];
  expectedAmount: number;
  windowFromDay: number | null;
  windowToDay: number | null;
  anchorMonthEnd: boolean;
  active: boolean;
  lastSeenAt: string | null;
}

interface SeriesManagerProps {
  series: SeriesVM[];
  categories: Category[];
  accounts: { id: string; name: string }[];
  currency: string;
  locale: string;
}

const CADENCES = [
  { value: "MONTHLY", label: "Monthly" },
  { value: "BIMONTHLY", label: "Every 2 months" },
  { value: "QUARTERLY", label: "Quarterly" },
  { value: "YEARLY", label: "Yearly" },
];

interface Draft {
  id: string | null;
  displayName: string;
  matcher: string;
  direction: "DEBIT" | "CREDIT";
  categoryId: string | null;
  bankAccountId: string | null;
  cadence: SeriesFields["cadence"];
  expectedAmount: string;
  windowFromDay: string;
  windowToDay: string;
  anchorMonthEnd: boolean;
  active: boolean;
}

const EMPTY: Draft = {
  id: null,
  displayName: "",
  matcher: "",
  direction: "DEBIT",
  categoryId: null,
  bankAccountId: null,
  cadence: "MONTHLY",
  expectedAmount: "",
  windowFromDay: "",
  windowToDay: "",
  anchorMonthEnd: false,
  active: true,
};

export function SeriesManager({ series, categories, accounts, currency, locale }: SeriesManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fmt = (n: number) => formatCurrency(n, currency, locale);

  function openEdit(s: SeriesVM) {
    setDraft({
      id: s.id,
      displayName: s.displayName,
      matcher: s.matcher,
      direction: s.direction,
      categoryId: s.categoryId,
      bankAccountId: s.bankAccountId,
      cadence: s.cadence,
      expectedAmount: String(s.expectedAmount),
      windowFromDay: s.windowFromDay != null ? String(s.windowFromDay) : "",
      windowToDay: s.windowToDay != null ? String(s.windowToDay) : "",
      anchorMonthEnd: s.anchorMonthEnd,
      active: s.active,
    });
  }

  function save() {
    if (!draft) return;
    const fields: SeriesFields = {
      displayName: draft.displayName,
      matcher: draft.matcher,
      direction: draft.direction,
      categoryId: draft.categoryId,
      bankAccountId: draft.bankAccountId,
      cadence: draft.cadence,
      expectedAmount: Number(draft.expectedAmount),
      windowFromDay: draft.windowFromDay ? Number(draft.windowFromDay) : null,
      windowToDay: draft.windowToDay ? Number(draft.windowToDay) : null,
      anchorMonthEnd: draft.anchorMonthEnd,
      active: draft.active,
    };
    setError(null);
    startTransition(async () => {
      try {
        if (draft.id) await updateSeries(draft.id, fields);
        else await createSeries(fields);
        setDraft(null);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save");
      }
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      try {
        await deleteSeries(id);
        router.refresh();
      } catch {
        // refresh restores truth
      }
    });
  }

  const debits = series.filter((s) => s.direction === "DEBIT");
  const credits = series.filter((s) => s.direction === "CREDIT");

  return (
    <div className="space-y-6">
      {series.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title="Register your standing charges"
          description="Rent, mortgage, school, utilities, subscriptions — each series generates its expected charges forward and the app matches arrivals against them."
        >
          <Button onClick={() => setDraft({ ...EMPTY })}>
            <Plus className="mr-2 h-4 w-4" />
            Add series
          </Button>
        </EmptyState>
      ) : (
        <>
          {[
            { title: "Charges", rows: debits },
            { title: "Income", rows: credits },
          ]
            .filter((g) => g.rows.length > 0)
            .map((group) => (
              <Card key={group.title}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base">{group.title}</CardTitle>
                  {group.title === "Charges" && (
                    <Button variant="ghost" size="sm" onClick={() => setDraft({ ...EMPTY })} disabled={isPending}>
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      Series
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
                  <ul className="divide-y">
                    {group.rows.map((s) => (
                      <li key={s.id} className="flex items-center gap-3 py-2 text-sm">
                        <button
                          type="button"
                          className="min-w-0 flex-1 truncate text-left font-medium hover:underline"
                          onClick={() => openEdit(s)}
                        >
                          {s.displayName}
                          {!s.active && (
                            <Badge variant="secondary" className="ml-2 text-xs">Paused</Badge>
                          )}
                        </button>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {CADENCES.find((c) => c.value === s.cadence)?.label ?? s.cadence}
                          {s.anchorMonthEnd
                            ? " · month end"
                            : s.windowFromDay != null
                              ? ` · day ${s.windowFromDay}${s.windowToDay && s.windowToDay !== s.windowFromDay ? `–${s.windowToDay}` : ""}`
                              : ""}
                        </span>
                        <span
                          className={`w-24 shrink-0 text-right tabular-nums ${s.direction === "CREDIT" ? "text-success" : ""}`}
                        >
                          {s.direction === "CREDIT" ? "+" : "−"}
                          {fmt(s.expectedAmount)}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-muted-foreground"
                          onClick={() => remove(s.id)}
                          disabled={isPending}
                          title="Delete series (and its pending planned items)"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
        </>
      )}

      <Dialog open={draft !== null} onOpenChange={(o) => { if (!o) setDraft(null); }}>
        <DialogContent className="pt-8 sm:w-[min(96vw,480px)] sm:max-w-[min(96vw,480px)]">
          <DialogTitle>{draft?.id ? "Edit series" : "New series"}</DialogTitle>
          {draft && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="sr-name">Name</Label>
                  <Input
                    id="sr-name"
                    placeholder="Alquiler Barcelona"
                    value={draft.displayName}
                    onChange={(e) => setDraft({ ...draft, displayName: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sr-matcher">Matcher text</Label>
                  <Input
                    id="sr-matcher"
                    placeholder="ALQUILER"
                    value={draft.matcher}
                    onChange={(e) => setDraft({ ...draft, matcher: e.target.value })}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                The matcher is looked for (accents and case ignored) inside a
                transaction&apos;s description to link the arrival to this series.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Direction</Label>
                  <SimpleSelect
                    value={draft.direction}
                    onValueChange={(v) => setDraft({ ...draft, direction: v as "DEBIT" | "CREDIT" })}
                    options={[
                      { value: "DEBIT", label: "Charge" },
                      { value: "CREDIT", label: "Income" },
                    ]}
                    ariaLabel="Direction"
                    className="w-full"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sr-amount">Expected amount ({currency})</Label>
                  <Input
                    id="sr-amount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={draft.expectedAmount}
                    onChange={(e) => setDraft({ ...draft, expectedAmount: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Cadence</Label>
                  <SimpleSelect
                    value={draft.cadence}
                    onValueChange={(v) => setDraft({ ...draft, cadence: v as Draft["cadence"] })}
                    options={CADENCES}
                    ariaLabel="Cadence"
                    className="w-full"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Account</Label>
                  <SimpleSelect
                    value={draft.bankAccountId ?? "none"}
                    onValueChange={(v) => setDraft({ ...draft, bankAccountId: v === "none" ? null : v })}
                    options={[
                      { value: "none", label: "Not set" },
                      ...accounts.map((a) => ({ value: a.id, label: a.name })),
                    ]}
                    ariaLabel="Account"
                    className="w-full"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Category {draft.direction === "DEBIT" ? "" : "(optional)"}</Label>
                <CategorySelect
                  defaultValue={draft.categoryId ?? undefined}
                  onValueChange={(v) => setDraft({ ...draft, categoryId: v || null })}
                  categories={categories}
                  ariaLabel="Series category"
                  className="w-full"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="sr-from">Window from day</Label>
                  <Input
                    id="sr-from"
                    type="number"
                    min="1"
                    max="31"
                    placeholder="1"
                    value={draft.windowFromDay}
                    disabled={draft.anchorMonthEnd}
                    onChange={(e) => setDraft({ ...draft, windowFromDay: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sr-to">to day</Label>
                  <Input
                    id="sr-to"
                    type="number"
                    min="1"
                    max="31"
                    placeholder="6"
                    value={draft.windowToDay}
                    disabled={draft.anchorMonthEnd}
                    onChange={(e) => setDraft({ ...draft, windowToDay: e.target.value })}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={draft.anchorMonthEnd}
                  onCheckedChange={(c) => setDraft({ ...draft, anchorMonthEnd: c === true })}
                />
                Charges on the LAST day of the month (mortgage-style — survives
                short months)
              </label>
              {draft.id && (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={draft.active}
                    onCheckedChange={(c) => setDraft({ ...draft, active: c === true })}
                  />
                  Active (paused series stop generating planned charges)
                </label>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex items-center justify-end gap-2">
                <Button variant="outline" onClick={() => setDraft(null)} disabled={isPending}>
                  Cancel
                </Button>
                <Button onClick={save} disabled={isPending}>
                  {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Save
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
