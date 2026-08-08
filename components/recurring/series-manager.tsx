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
import { useCanWrite } from "@/components/layout/role-provider";
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
} from "@/app/(app)/recurring/actions";
// A "use server" module can't export a type, so take it from the source.
import type { SeriesFields } from "@/lib/mcp/manage";
import { useT } from "@/components/i18n/i18n-provider";
import { RichText } from "@/components/i18n/rich-text";
import type { MessageKey } from "@/lib/i18n/dictionaries/en";

export interface SeriesVM {
  id: string;
  displayName: string;
  matcher: string;
  direction: "DEBIT" | "CREDIT";
  categoryId: string | null;
  ruleId: string | null;
  cadence: SeriesFields["cadence"];
  expectedAmount: number;
  windowFromDay: number | null;
  windowToDay: number | null;
  anchorMonthEnd: boolean;
  active: boolean;
  lastSeenAt: string | null;
}

/** "Make recurring" from a transaction: the form opens prefilled with this. */
export interface SeriesPrefill {
  displayName: string;
  matcher: string;
  direction: "DEBIT" | "CREDIT";
  categoryId: string | null;
  expectedAmount: string;
  windowFromDay: string;
  windowToDay: string;
}

interface SeriesManagerProps {
  series: SeriesVM[];
  suggestions: RecurringSuggestion[];
  prefill?: SeriesPrefill | null;
  rules: { id: string; name: string }[];
  categories: Category[];
  currency: string;
  locale: string;
}

const CADENCES: { value: string; label: MessageKey }[] = [
  { value: "MONTHLY", label: "recurring.cadence.MONTHLY" },
  { value: "BIMONTHLY", label: "recurring.cadence.BIMONTHLY" },
  { value: "QUARTERLY", label: "recurring.cadence.QUARTERLY" },
  { value: "YEARLY", label: "recurring.cadence.YEARLY" },
];

interface Draft {
  id: string | null;
  displayName: string;
  matcher: string;
  direction: "DEBIT" | "CREDIT";
  categoryId: string | null;
  ruleId: string | null;
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
  ruleId: null,
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
  prefill,
  rules,
  categories,
  currency,
  locale,
}: SeriesManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(
    prefill ? { ...EMPTY, ...prefill } : null
  );
  const canWrite = useCanWrite();
  const t = useT();
  const cadenceOptions = CADENCES.map((c) => ({ value: c.value, label: t(c.label) }));
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
    setAdvancedOpen(s.ruleId !== null || s.matcher.trim() !== s.displayName.trim());
    setDraft({
      id: s.id,
      displayName: s.displayName,
      matcher: s.matcher,
      direction: s.direction,
      categoryId: s.categoryId,
      ruleId: s.ruleId,
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
      ruleId: null,
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
    dismissRecurringSuggestion(merchantKey)
      .then((res) => {
        if (!res.ok) {
          setHiddenKeys((keys) => keys.filter((k) => k !== merchantKey));
          setDismissError(res.error);
        }
      })
      .catch((err: unknown) => {
        // The action itself never throws — a rejection means the request
        // didn't reach it. Show the transport error verbatim: its text tells
        // apart a network failure, a non-RSC response and a server throw.
        setHiddenKeys((keys) => keys.filter((k) => k !== merchantKey));
        setDismissError(
          t("recurring.requestFailed", {
            detail:
              err instanceof Error
                ? err.message.slice(0, 300)
                : String(err).slice(0, 300),
          }),
        );
      });
  }

  function save() {
    if (!draft) return;
    if (!draft.categoryId && !draft.ruleId) {
      setError(t("recurring.pickCategory"));
      return;
    }
    const fields: SeriesFields = {
      displayName: draft.displayName,
      matcher: draft.matcher,
      direction: draft.direction,
      categoryId: draft.categoryId,
      ruleId: draft.ruleId,
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
        const res = draft.id
          ? await updateSeries(draft.id, fields)
          : await createSeries(fields);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setDraft(null);
        // Drop ?fromTx so a reload doesn't reopen the prefilled form.
        if (prefill) router.replace("/recurring");
        else router.refresh();
      } catch (err) {
        setError(
          `Request failed: ${err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300)}`,
        );
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
      {canWrite && visibleSuggestions.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-brand" />
              {t("recurring.detected")}
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
          title={t("recurring.empty.title")}
          description={t("recurring.empty.body")}
        >
          {canWrite && (
          <Button onClick={() => { setAdvancedOpen(false); setDraft({ ...EMPTY }); }}>
            <Plus className="mr-2 h-4 w-4" />
            {t("recurring.addSeries")}
          </Button>
          )}
        </EmptyState>
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">{t("recurring.series")}</CardTitle>
            {canWrite && (
            <Button
              variant="ghost"
              size="sm"
              className="-my-1 h-8"
              onClick={() => { setAdvancedOpen(false); setDraft({ ...EMPTY }); }}
              disabled={isPending}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              {t("objectives.add")}
            </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              {
                key: "DEBIT",
                label: t("recurring.charges"),
                list: rows.filter((s) => s.direction === "DEBIT"),
              },
              {
                key: "CREDIT",
                label: t("recurring.income"),
                list: rows.filter((s) => s.direction === "CREDIT"),
              },
            ]
              .filter((g) => g.list.length > 0)
              .map((group, gi) => (
            <div key={group.key} className={gi > 0 ? "space-y-1 border-t pt-3" : "space-y-1"}>
            <p className="text-xs font-medium text-muted-foreground">{group.label}</p>
            <ul className="divide-y">
              {group.list.map((s) => {
                const cat = s.categoryId ? categoryById.get(s.categoryId) : null;
                const timing = s.anchorMonthEnd
                  ? t("recurring.monthEnd")
                  : s.windowFromDay == null
                    ? ""
                    : s.windowToDay && s.windowToDay !== s.windowFromDay
                      ? t("recurring.dayRange", {
                          from: s.windowFromDay,
                          to: s.windowToDay,
                        })
                      : t("recurring.day", { day: s.windowFromDay });
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
                      {canWrite ? (
                      <button
                        type="button"
                        className="min-w-0 flex-1 truncate text-left font-medium hover:underline"
                        onClick={() => openEdit(s)}
                      >
                        {s.displayName}
                        {!s.active && (
                          <Badge variant="secondary" className="ml-2 text-xs">
                            {t("recurring.paused")}
                          </Badge>
                        )}
                      </button>
                      ) : (
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {s.displayName}
                        {!s.active && (
                          <Badge variant="secondary" className="ml-2 text-xs">
                            {t("recurring.paused")}
                          </Badge>
                        )}
                      </span>
                      )}
                      <span className="hidden sm:inline-flex">{chip}</span>
                      <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                        {cadenceOptions.find((c) => c.value === s.cadence)?.label ?? s.cadence}
                        {timing}
                      </span>
                      <span
                        className={`hidden w-24 shrink-0 text-right tabular-nums sm:inline ${s.direction === "CREDIT" ? "text-success" : ""}`}
                      >
                        {s.direction === "CREDIT" ? "+" : "−"}
                        {fmt(s.expectedAmount)}
                      </span>
                      {canWrite && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-muted-foreground"
                        onClick={() => setConfirmDelete({ id: s.id, name: s.displayName })}
                        disabled={isPending}
                        title={t("recurring.deleteSeries")}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2 text-xs sm:hidden">
                      <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
                        {chip}
                        <span className="truncate">
                          {cadenceOptions.find((c) => c.value === s.cadence)?.label ?? s.cadence}
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
            </div>
              ))}
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
                  <dt className="text-muted-foreground">{t("recurring.detail.amount")}</dt>
                  <dd
                    className={`tabular-nums ${
                      detail.direction === "CREDIT" ? "text-success" : ""
                    }`}
                  >
                    {detail.direction === "CREDIT" ? "+" : "−"}~{fmt(detail.expectedAmount)}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">{t("recurring.detail.cadence")}</dt>
                  <dd>{cadenceOptions.find((c) => c.value === detail.cadence)?.label ?? detail.cadence}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">{t("recurring.detail.seen")}</dt>
                  <dd>
                    {t("recurring.detail.seenValue", {
                      count: detail.occurrences,
                      date: detail.lastDate,
                    })}
                  </dd>
                </div>
                {detail.windowFromDay != null && (
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">
                      {t("recurring.detail.usualDays")}
                    </dt>
                    <dd>
                      {detail.windowFromDay}
                      {detail.windowToDay && detail.windowToDay !== detail.windowFromDay
                        ? `–${detail.windowToDay}`
                        : ""}
                    </dd>
                  </div>
                )}
                <div className="flex items-center justify-between gap-4">
                  <dt className="shrink-0 text-muted-foreground">
                    {t("recurring.detail.matcher")}
                  </dt>
                  <dd className="min-w-0 truncate text-xs text-muted-foreground">
                    {detail.merchantKey}
                  </dd>
                </div>
              </dl>

              {detail.transactions.length > 0 && (
                <ul className="max-h-40 space-y-1 overflow-y-auto border-t pt-2 text-xs">
                  {detail.transactions.map((t, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between gap-2 text-muted-foreground"
                    >
                      <span className="tabular-nums">{t.date}</span>
                      <span className="tabular-nums">{fmt(t.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
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
                  {t("common.dismiss")}
                </Button>
                <Button
                  onClick={() => {
                    applySuggestion(detail);
                    setDetail(null);
                  }}
                  disabled={isPending}
                >
                  {t("recurring.useAsSeries")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={draft !== null} onOpenChange={(o) => { if (!o) setDraft(null); }}>
        <DialogContent className="pt-8 sm:w-[min(96vw,480px)] sm:max-w-[min(96vw,480px)]">
          <DialogTitle>
            {draft?.id ? t("recurring.form.edit") : t("recurring.form.new")}
          </DialogTitle>
          {draft && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="sr-name">{t("recurring.form.name")}</Label>
                <Input
                  id="sr-name"
                  placeholder={t("recurring.form.namePlaceholder")}
                  value={draft.displayName}
                  onChange={(e) => setDraft({ ...draft, displayName: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t("recurring.form.direction")}</Label>
                  <SimpleSelect
                    value={draft.direction}
                    onValueChange={(v) => setDraft({ ...draft, direction: v as "DEBIT" | "CREDIT" })}
                    options={[
                      { value: "DEBIT", label: t("recurring.form.charge") },
                      { value: "CREDIT", label: t("recurring.income") },
                    ]}
                    ariaLabel={t("recurring.form.direction")}
                    className="w-full"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sr-amount">
                    {t("recurring.form.amount", { currency })}
                  </Label>
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
                  <Label>{t("recurring.detail.cadence")}</Label>
                  <SimpleSelect
                    value={draft.cadence}
                    onValueChange={(v) => setDraft({ ...draft, cadence: v as Draft["cadence"] })}
                    options={cadenceOptions}
                    ariaLabel={t("recurring.detail.cadence")}
                    className="w-full"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>
                    {draft.ruleId
                      ? t("recurring.form.categoryFromRule")
                      : t("recurring.form.category")}
                  </Label>
                  <CategorySelect
                    defaultValue={draft.categoryId ?? undefined}
                    onValueChange={(v) => setDraft({ ...draft, categoryId: v || null })}
                    categories={categories}
                    ariaLabel={t("recurring.form.categoryAria")}
                    className="w-full"
                    disabled={draft.ruleId !== null}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="sr-from">{t("recurring.form.fromDay")}</Label>
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
                  <Label htmlFor="sr-to">{t("recurring.form.toDay")}</Label>
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
                {t("recurring.form.monthEnd")}
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
                  {t("recurring.form.advanced")}
                </button>
                {advancedOpen && (
                  <div className="mt-2 space-y-4">
                    <div className="space-y-1.5">
                      <Label>{t("recurring.form.rule")}</Label>
                      <SimpleSelect
                        value={draft.ruleId ?? "none"}
                        onValueChange={(v) =>
                          setDraft({ ...draft, ruleId: v === "none" ? null : v })
                        }
                        options={[
                          { value: "none", label: t("recurring.form.noRule") },
                          ...rules.map((r) => ({ value: r.id, label: r.name })),
                        ]}
                        ariaLabel={t("recurring.form.ruleAria")}
                        className="w-full"
                      />
                      <p className="text-xs text-muted-foreground">
                        {t("recurring.form.ruleHelp")}
                      </p>
                    </div>
                    {!draft.ruleId && (
                      <div className="space-y-1.5">
                        <Label htmlFor="sr-matcher">{t("recurring.form.matcher")}</Label>
                        <Input
                          id="sr-matcher"
                          placeholder={t("recurring.form.matcherPlaceholder")}
                          value={draft.matcher}
                          onChange={(e) => setDraft({ ...draft, matcher: e.target.value })}
                        />
                        <p className="text-xs text-muted-foreground">
                          {t("recurring.form.matcherHelp")}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {draft.id && (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={draft.active}
                    onCheckedChange={(c) => setDraft({ ...draft, active: c === true })}
                  />
                  {t("recurring.form.active")}
                </label>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex items-center justify-end gap-2">
                <Button variant="outline" onClick={() => setDraft(null)} disabled={isPending}>
                  {t("common.cancel")}
                </Button>
                <Button onClick={save} disabled={isPending}>
                  {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {t("common.save")}
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
          <DialogTitle>{t("recurring.delete.title")}</DialogTitle>
          {confirmDelete && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                <RichText
                  template={t("recurring.delete.body")}
                  slots={{
                    name: (
                      <span className="font-medium text-foreground">
                        {confirmDelete.name}
                      </span>
                    ),
                  }}
                />
              </p>
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setConfirmDelete(null)}
                  disabled={isPending}
                >
                  {t("common.cancel")}
                </Button>
                <Button variant="destructive" onClick={confirmedRemove} disabled={isPending}>
                  {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {t("common.delete")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
