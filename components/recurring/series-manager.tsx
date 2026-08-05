"use client";

// Manual CRUD over the recurring-series registry — the automation layer of
// the monthly control: each series feeds its category's objective. The system
// proposes possible recurrings detected in the history (badge-counted below);
// the user accepts a proposal (editable — amounts are approximate, bills
// vary) or dismisses it, or creates a series from scratch. No account field:
// accounts carry no semantics in planning.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Loader2, Plus, Repeat, Sparkles, Trash2, X } from "lucide-react";
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
import type { RecurringSuggestion } from "@/lib/recurring/detect";
import {
  createSeries,
  updateSeries,
  deleteSeries,
  dismissRecurringSuggestion,
  type SeriesFields,
} from "@/app/(app)/recurring/actions";

export interface SeriesVM {
  id: string;
  displayName: string;
  matcher: string;
  direction: "DEBIT" | "CREDIT";
  categoryId: string | null;
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
  suggestions: RecurringSuggestion[];
  categories: Category[];
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
  cadence: "MONTHLY",
  expectedAmount: "",
  windowFromDay: "",
  windowToDay: "",
  anchorMonthEnd: false,
  active: true,
};

export function SeriesManager({
  series,
  suggestions,
  categories,
  currency,
  locale,
}: SeriesManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const [detail, setDetail] = useState<RecurringSuggestion | null>(null);
  // The matcher is internal machinery (arrival recognition); it hides under
  // Advanced and only unfolds when it actually differs from the name.
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // Optimistically hidden proposals: dismissing removes the row on the click
  // itself and persists in the background; a failure brings it back WITH a
  // visible message (a silent rollback reads as a haunted UI — typically it
  // means the tab predates the current deployment and needs a reload).
  const [hiddenKeys, setHiddenKeys] = useState<string[]>([]);
  const [dismissError, setDismissError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fmt = (n: number) => formatCurrency(n, currency, locale);
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  function openEdit(s: SeriesVM) {
    setAdvancedOpen(s.matcher.trim() !== s.displayName.trim());
    setDraft({
      id: s.id,
      displayName: s.displayName,
      matcher: s.matcher,
      direction: s.direction,
      categoryId: s.categoryId,
      cadence: s.cadence,
      expectedAmount: String(s.expectedAmount),
      windowFromDay: s.windowFromDay != null ? String(s.windowFromDay) : "",
      windowToDay: s.windowToDay != null ? String(s.windowToDay) : "",
      anchorMonthEnd: s.anchorMonthEnd,
      active: s.active,
    });
  }

  function applySuggestion(s: RecurringSuggestion) {
    setAdvancedOpen(false);
    setDraft({
      id: null,
      displayName: s.displayName,
      matcher: s.merchantKey,
      direction: s.direction,
      categoryId: s.categoryId,
      cadence: s.cadence,
      expectedAmount: String(s.expectedAmount),
      windowFromDay: s.windowFromDay != null ? String(s.windowFromDay) : "",
      windowToDay: s.windowToDay != null ? String(s.windowToDay) : "",
      anchorMonthEnd: false,
      active: true,
    });
  }

  function dismiss(merchantKey: string) {
    setDetail(null);
    setDismissError(null);
    setHiddenKeys((keys) => [...keys, merchantKey]);
    dismissRecurringSuggestion(merchantKey).catch(() => {
      setHiddenKeys((keys) => keys.filter((k) => k !== merchantKey));
      setDismissError("Couldn't save the dismissal — reload the page and try again.");
    });
  }

  function save() {
    if (!draft) return;
    if (!draft.categoryId) {
      setError("Pick a category — the series feeds that category's objective");
      return;
    }
    const fields: SeriesFields = {
      displayName: draft.displayName,
      matcher: draft.matcher,
      direction: draft.direction,
      categoryId: draft.categoryId,
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

  function confirmedRemove() {
    if (!confirmDelete) return;
    const { id } = confirmDelete;
    startTransition(async () => {
      try {
        await deleteSeries(id);
        setConfirmDelete(null);
        router.refresh();
      } catch {
        setConfirmDelete(null);
        router.refresh();
      }
    });
  }

  const rows = [
    ...series.filter((s) => s.direction === "DEBIT"),
    ...series.filter((s) => s.direction === "CREDIT"),
  ];
  const visibleSuggestions = suggestions.filter(
    (s) => !hiddenKeys.includes(s.merchantKey)
  );

  return (
    <div className="space-y-6">
      {visibleSuggestions.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-brand" />
              Detected
              <Badge variant="brand" className="h-5 min-w-5 justify-center px-1 text-xs">
                {visibleSuggestions.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {visibleSuggestions.map((s) => (
                <li key={`${s.direction}:${s.merchantKey}`}>
                  {/* The whole row opens the proposal's detail (Use / Dismiss
                      live there) — no button cluster squeezing the name. */}
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 py-2 text-left text-sm"
                    onClick={() => setDetail(s)}
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {s.displayName}
                    </span>
                    <span
                      className={`shrink-0 tabular-nums ${
                        s.direction === "CREDIT" ? "text-success" : "text-muted-foreground"
                      }`}
                    >
                      ~{fmt(s.expectedAmount)}
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
            {dismissError && (
              <p className="mt-2 text-xs text-destructive">{dismissError}</p>
            )}
          </CardContent>
        </Card>
      )}

      {series.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title="Register your recurring charges and income"
          description="Each series feeds its category in the Budget and shows up in Upcoming."
        >
          <Button onClick={() => { setAdvancedOpen(false); setDraft({ ...EMPTY }); }}>
            <Plus className="mr-2 h-4 w-4" />
            Add series
          </Button>
        </EmptyState>
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Series</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="-my-1 h-8"
              onClick={() => { setAdvancedOpen(false); setDraft({ ...EMPTY }); }}
              disabled={isPending}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add
            </Button>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {rows.map((s) => {
                const cat = s.categoryId ? categoryById.get(s.categoryId) : null;
                const timing = s.anchorMonthEnd
                  ? " · month end"
                  : s.windowFromDay != null
                    ? ` · day ${s.windowFromDay}${s.windowToDay && s.windowToDay !== s.windowFromDay ? `–${s.windowToDay}` : ""}`
                    : "";
                const chip = cat && (
                  <span className="inline-flex min-w-0 shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: cat.color }}
                    />
                    <span className="max-w-28 truncate">{cat.name}</span>
                  </span>
                );
                return (
                  <li key={s.id} className="py-2 text-sm">
                    {/* One line on desktop; on mobile the chip, cadence and
                        amount wrap to a second line so the name keeps the
                        width. */}
                    <div className="flex items-center gap-3">
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
                      <span className="hidden sm:inline-flex">{chip}</span>
                      <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                        {CADENCES.find((c) => c.value === s.cadence)?.label ?? s.cadence}
                        {timing}
                      </span>
                      <span
                        className={`hidden w-24 shrink-0 text-right tabular-nums sm:inline ${s.direction === "CREDIT" ? "text-success" : ""}`}
                      >
                        {s.direction === "CREDIT" ? "+" : "−"}
                        {fmt(s.expectedAmount)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-muted-foreground"
                        onClick={() => setConfirmDelete({ id: s.id, name: s.displayName })}
                        disabled={isPending}
                        title="Delete series"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2 text-xs sm:hidden">
                      <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
                        {chip}
                        <span className="truncate">
                          {CADENCES.find((c) => c.value === s.cadence)?.label ?? s.cadence}
                          {timing}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 tabular-nums ${s.direction === "CREDIT" ? "text-success" : ""}`}
                      >
                        {s.direction === "CREDIT" ? "+" : "−"}
                        {fmt(s.expectedAmount)}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      <Dialog open={detail !== null} onOpenChange={(o) => { if (!o) setDetail(null); }}>
        <DialogContent className="pt-8 sm:w-[min(96vw,420px)] sm:max-w-[min(96vw,420px)]">
          <DialogTitle className="truncate pr-6">{detail?.displayName}</DialogTitle>
          {detail && (
            <div className="space-y-4">
              <dl className="space-y-1.5 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Amount (approx.)</dt>
                  <dd
                    className={`tabular-nums ${
                      detail.direction === "CREDIT" ? "text-success" : ""
                    }`}
                  >
                    {detail.direction === "CREDIT" ? "+" : "−"}~{fmt(detail.expectedAmount)}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Cadence</dt>
                  <dd>{CADENCES.find((c) => c.value === detail.cadence)?.label ?? detail.cadence}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Seen</dt>
                  <dd>
                    {detail.occurrences}× · last {detail.lastDate}
                  </dd>
                </div>
                {detail.windowFromDay != null && (
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Usual days</dt>
                    <dd>
                      {detail.windowFromDay}
                      {detail.windowToDay && detail.windowToDay !== detail.windowFromDay
                        ? `–${detail.windowToDay}`
                        : ""}
                    </dd>
                  </div>
                )}
                <div className="flex items-center justify-between gap-4">
                  <dt className="shrink-0 text-muted-foreground">Matcher</dt>
                  <dd className="min-w-0 truncate text-xs text-muted-foreground">
                    {detail.merchantKey}
                  </dd>
                </div>
              </dl>
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    dismiss(detail.merchantKey);
                    setDetail(null);
                  }}
                  disabled={isPending}
                >
                  <X className="mr-1 h-3.5 w-3.5" />
                  Dismiss
                </Button>
                <Button
                  onClick={() => {
                    applySuggestion(detail);
                    setDetail(null);
                  }}
                  disabled={isPending}
                >
                  Use as series
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={draft !== null} onOpenChange={(o) => { if (!o) setDraft(null); }}>
        <DialogContent className="pt-8 sm:w-[min(96vw,480px)] sm:max-w-[min(96vw,480px)]">
          <DialogTitle>{draft?.id ? "Edit series" : "New series"}</DialogTitle>
          {draft && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="sr-name">Name</Label>
                <Input
                  id="sr-name"
                  placeholder="Alquiler Barcelona"
                  value={draft.displayName}
                  onChange={(e) => setDraft({ ...draft, displayName: e.target.value })}
                />
              </div>

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
                  <Label htmlFor="sr-amount">Amount ({currency}, approx.)</Label>
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
                  <Label>Category</Label>
                  <CategorySelect
                    defaultValue={draft.categoryId ?? undefined}
                    onValueChange={(v) => setDraft({ ...draft, categoryId: v || null })}
                    categories={categories}
                    ariaLabel="Series category"
                    className="w-full"
                  />
                </div>
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
                Charges on the LAST day of the month
              </label>

              <div>
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                  onClick={() => setAdvancedOpen((o) => !o)}
                  aria-expanded={advancedOpen}
                >
                  <ChevronRight
                    className={`h-3 w-3 transition-transform ${advancedOpen ? "rotate-90" : ""}`}
                  />
                  Advanced
                </button>
                {advancedOpen && (
                  <div className="mt-2 space-y-1.5">
                    <Label htmlFor="sr-matcher">Matcher text</Label>
                    <Input
                      id="sr-matcher"
                      placeholder="Defaults to the name"
                      value={draft.matcher}
                      onChange={(e) => setDraft({ ...draft, matcher: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Looked for inside the bank&apos;s descriptor to recognize
                      this series&apos; arrivals. Set it when the bank writes
                      the charge differently from the name.
                    </p>
                  </div>
                )}
              </div>
              {draft.id && (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={draft.active}
                    onCheckedChange={(c) => setDraft({ ...draft, active: c === true })}
                  />
                  Active
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

      <Dialog
        open={confirmDelete !== null}
        onOpenChange={(o) => {
          if (!o && !isPending) setConfirmDelete(null);
        }}
      >
        <DialogContent className="pt-8 sm:w-[min(96vw,420px)] sm:max-w-[min(96vw,420px)]">
          <DialogTitle>Delete series?</DialogTitle>
          {confirmDelete && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{confirmDelete.name}</span>{" "}
                and its pending expected charges are removed.
              </p>
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setConfirmDelete(null)}
                  disabled={isPending}
                >
                  Cancel
                </Button>
                <Button variant="destructive" onClick={confirmedRemove} disabled={isPending}>
                  {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Delete
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
