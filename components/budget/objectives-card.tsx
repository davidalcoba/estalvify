"use client";

// Category objectives: the month's budget assignments, both kinds. A variable
// objective is judged by pace — % consumed is always shown NEXT TO % of month
// elapsed, never alone. A rollover fund has INVERTED polarity: assigning is
// accumulation, so its bar fills green as the quota is set aside — same
// widget, opposite meaning, visually distinct (piggy icon + balance).
//
// Editing and deleting go through DialogContent, which is a bottom sheet on
// mobile by itself and never autofocuses (no keyboard jump over the form).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useCanWrite } from "@/components/layout/role-provider";
import { useT } from "@/components/i18n/i18n-provider";
import { RichText } from "@/components/i18n/rich-text";
import {
  ChevronRight,
  Loader2,
  Pencil,
  PiggyBank,
  Plus,
  Repeat,
  Target,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { type Category } from "@/components/categorize/category-options";
import { CategorySelect } from "@/components/categorize/category-select";
import { formatCurrency, formatCurrencyRound } from "@/lib/formatters";
import { incomeTone } from "@/lib/budget/pace";
import type { CategoryObjective, IncomeObjective } from "@/lib/budget/month-status";
import type { ControlRow } from "@/lib/budget/control";
import { upsertBudgetObjective, removeBudgetObjective } from "@/app/(app)/plan/actions";

interface ObjectivesCardProps {
  objectives: CategoryObjective[];
  incomeObjectives: IncomeObjective[];
  /** Every non-rollover objective, ordered by projected deviation. */
  control: ControlRow[];
  /** 0–1, how much of the month has elapsed — the pace reference. */
  monthElapsed: number;
  /** The same reference in days, which is how the header states it. */
  daysElapsed: number;
  daysInMonth: number;
  categories: Category[];
  year: number;
  month: number;
  currency: string;
  locale: string;
}

/** Bar geometry never leaves 0–100; a zero budget must not produce NaN. */
const clampPct = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0);

/**
 * The row's colour. Grey while nothing has been spent — a state of OK on an
 * untouched category is not news worth colouring green.
 */
function toneVar(state: ControlRow["state"], consumed: number): string {
  if (consumed === 0) return "color-mix(in oklch, var(--foreground) 22%, transparent)";
  if (state === "EXCEDIDO") return "var(--destructive)";
  if (state === "RIESGO") return "var(--warning)";
  return "var(--success)";
}

interface Draft {
  categoryId: string | null;
  assigned: string;
  rollover: boolean;
  /** Editing an existing row locks the category (it is the row's key). */
  existing: boolean;
}

export function ObjectivesCard({
  objectives,
  incomeObjectives,
  control,
  monthElapsed,
  daysElapsed,
  daysInMonth,
  categories,
  year,
  month,
  currency,
  locale,
}: ObjectivesCardProps) {
  const router = useRouter();
  const t = useT();
  const canWrite = useCanWrite();
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirm, setConfirm] = useState<{ categoryId: string; name: string } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fmt = (n: number) => formatCurrency(n, currency, locale);
  const fmt0 = (n: number) => formatCurrencyRound(n, currency, locale);
  const elapsedPct = Math.round(monthElapsed * 100);

  function save() {
    if (!draft?.categoryId) {
      setError(t("objectives.pickCategory"));
      return;
    }
    const assigned = Number(draft.assigned);
    if (!Number.isFinite(assigned) || assigned < 0) {
      setError(t("objectives.invalidAmount"));
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await upsertBudgetObjective(draft.categoryId!, year, month, assigned, draft.rollover);
        setDraft(null);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : t("settings.saveFailed"));
      }
    });
  }

  function confirmedRemove() {
    if (!confirm) return;
    const { categoryId } = confirm;
    startTransition(async () => {
      try {
        await removeBudgetObjective(categoryId, year, month);
        setConfirm(null);
        router.refresh();
      } catch {
        setConfirm(null); // refresh restores truth
        router.refresh();
      }
    });
  }

  // The Charges list shows every non-rollover objective (`chargeControl`,
  // already ordered by projected deviation) — the fixed ones included: on the
  // MONTH screen they are half the money, and their bar carries the committed
  // rule. It is the daily dashboard that narrows to the discretionary ones.
  // The objective detail (transactions, edit/remove) is joined back by
  // category.
  const detailById = new Map(objectives.map((o) => [o.categoryId, o]));
  const funds = objectives.filter((o) => o.rollover);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">
          {t("objectives.title")}
          {/* "23% elapsed" was read as "23% of the objectives". Days say the
              same thing and cannot be mistaken for progress against a goal. */}
          <span className="ml-2 align-middle text-xs font-normal text-muted-foreground">
            {daysElapsed > 0
              ? t("objectives.day", { day: daysElapsed, total: daysInMonth })
              : t("objectives.notStarted")}
          </span>
        </CardTitle>
        {canWrite && (
        <Button
          variant="ghost"
          size="sm"
          className="-my-1 h-8"
          onClick={() =>
            setDraft({ categoryId: null, assigned: "", rollover: false, existing: false })
          }
          disabled={isPending}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          {t("objectives.add")}
        </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {incomeObjectives.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground">
              {t("objectives.income")}
            </p>
            <ul className="space-y-1.5">
              {incomeObjectives.map((o) => {
                // Same bar-as-row as Charges, inverted polarity: the fill is
                // money that HAS arrived, so a full bar is the good end.
                const receivedPct = clampPct((o.received / o.expected) * 100);
                const tone = incomeTone(o.received, o.expected, monthElapsed);
                const toneVal =
                  tone === "success"
                    ? "var(--success)"
                    : tone === "warning"
                      ? "var(--warning)"
                      : "color-mix(in oklch, var(--foreground) 22%, transparent)";
                const pending = o.expected - o.received;
                const key = `income:${o.categoryId}`;
                const isOpen = expandedId === key;
                return (
                  <li key={key} className="text-sm">
                    <button
                      type="button"
                      onClick={() => setExpandedId(isOpen ? null : key)}
                      aria-expanded={isOpen}
                      className={`relative isolate flex h-11 w-full items-center gap-2 overflow-hidden bg-muted px-3 text-left ${
                        isOpen ? "rounded-t-lg" : "rounded-lg"
                      }`}
                    >
                      <span
                        className="absolute inset-y-0 left-0 -z-20"
                        style={{
                          width: `${receivedPct}%`,
                          background: `color-mix(in oklch, ${toneVal} 40%, transparent)`,
                        }}
                      />
                      <span
                        className="inline-block h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: o.categoryColor }}
                      />
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {o.categoryName}
                      </span>
                      {/* Received over expected — the Charges pair with the
                          polarity flipped. A fully arrived month keeps its tick
                          instead of repeating the same figure twice. */}
                      <span
                        className={`shrink-0 text-[13px] font-semibold tabular-nums ${
                          pending > 0.005 ? "text-muted-foreground" : "text-success"
                        }`}
                      >
                        {pending > 0.005 ? (
                          <>
                            {fmt0(o.received)}
                            <span className="text-muted-foreground/50">
                              <span className="mx-1">/</span>
                              {fmt0(o.expected)}
                            </span>
                          </>
                        ) : (
                          "✓"
                        )}
                      </span>
                      <ChevronRight
                        className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${
                          isOpen ? "rotate-90" : ""
                        }`}
                      />
                    </button>

                    {isOpen && (
                      <div className="space-y-2 rounded-b-lg border border-t-0 bg-muted/40 p-3 text-xs">
                        <dl className="grid grid-cols-3 gap-2">
                          <div>
                            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              {t("objectives.received")}
                            </dt>
                            <dd className="font-semibold tabular-nums">{fmt0(o.received)}</dd>
                          </div>
                          <div>
                            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              {t("objectives.expected")}
                            </dt>
                            <dd className="font-semibold tabular-nums text-muted-foreground">
                              {fmt0(o.expected)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              {t("objectives.pace")}
                            </dt>
                            <dd className="font-semibold tabular-nums text-muted-foreground">
                              {elapsedPct}%
                            </dd>
                          </div>
                        </dl>
                        {o.recurrings.length > 0 && (
                          <ul className="space-y-1 border-t pt-2">
                            {o.recurrings.map((r, i) => (
                              <li key={i} className="flex items-center justify-between gap-2">
                                <span className="min-w-0 truncate text-muted-foreground">
                                  <Repeat className="mr-1 inline h-3 w-3" />
                                  {r.description}
                                </span>
                                <span className="shrink-0 tabular-nums">
                                  {r.status === "MATCHED" ? "✓ " : ""}
                                  {fmt(r.amount)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {objectives.length === 0 ? (
          <div className="flex items-start gap-3 text-sm text-muted-foreground">
            <Target className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{t("objectives.empty")}</p>
          </div>
        ) : (
          <>
            {control.length > 0 && (
              <div className={incomeObjectives.length > 0 ? "space-y-3 border-t pt-3" : "space-y-3"}>
              <p className="text-xs font-medium text-muted-foreground">
                {t("objectives.charges")}
              </p>
              <ul className="space-y-1.5">
                {control.map((c) => {
                  const o = detailById.get(c.categoryId) ?? {
                    categoryId: c.categoryId,
                    categoryName: c.categoryName,
                    categoryColor: c.categoryColor,
                    base: 0,
                    extra: c.assigned,
                    assigned: c.assigned,
                    consumed: c.consumed,
                    rollover: false,
                    balance: null,
                    recurrings: [],
                    transactions: [],
                  };
                  const spentPct = clampPct((c.consumed / c.assigned) * 100);
                  const projPct = clampPct((c.projectedEndOfMonth / c.assigned) * 100);
                  const tone = toneVar(c.state, c.consumed);
                  const pctTone =
                    c.state === "EXCEDIDO"
                      ? "text-destructive"
                      : c.state === "RIESGO"
                        ? "text-warning"
                        : "text-success";
                  const left = c.assigned - c.consumed;
                  const isOpen = expandedId === o.categoryId;
                  return (
                    <li key={o.categoryId} className="text-sm">
                      {/* The bar IS the row: solid = spent, light tint = what
                          this pace still adds, the line where it lands, and a
                          wall at the edge when it overshoots. One object, one
                          number (what's left) — the overshoot chip only when
                          there is one.
                          No elapsed-month tick here on purpose: it sat at the
                          same x in every row (it is the same month for all of
                          them), so it read as a per-category limit, and the
                          projection line already says where this pace lands.
                          The pace lives in the header and in the panel. */}
                      <button
                        type="button"
                        onClick={() => setExpandedId(isOpen ? null : o.categoryId)}
                        aria-expanded={isOpen}
                        className={`relative isolate flex h-11 w-full items-center gap-2 overflow-hidden bg-muted px-3 text-left ${
                          isOpen ? "rounded-t-lg" : "rounded-lg"
                        }`}
                      >
                        <span
                          className="absolute inset-y-0 left-0 -z-20"
                          style={{
                            width: `${spentPct}%`,
                            background: `color-mix(in oklch, ${tone} 40%, transparent)`,
                          }}
                        />
                        <span
                          className="absolute inset-y-0 -z-20"
                          style={{
                            left: `${spentPct}%`,
                            width: `${Math.max(0, projPct - spentPct)}%`,
                            background: `color-mix(in oklch, ${tone} 15%, transparent)`,
                          }}
                        />
                        {projPct > spentPct + 1 && projPct < 99 && (
                          <span
                            className="absolute inset-y-0 -z-10 w-[1.5px]"
                            style={{
                              left: `${projPct}%`,
                              background: `color-mix(in oklch, ${tone} 60%, transparent)`,
                            }}
                          />
                        )}
                        {/* No wall at the right edge for a non-OK state. The
                            fill is already painted in that state's colour, so
                            the wall repeated in a hard 3px edge what the whole
                            bar was saying in amber or red — and read as a
                            border on the row rather than as part of it. */}
                        {/* No mark for the committed slice in the row. A rule
                            along the bottom was tried and removed: the
                            recurring-fed objectives are the ones whose budget
                            IS their recurring total, so it came out full-width
                            on every row that had it — distinguishing nothing,
                            and reading as a black border on the row rather
                            than as a marking inside the bar. The committed
                            amount is stated in the panel, as `Fixed`. */}
                        <span
                          className="inline-block h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: o.categoryColor }}
                        />
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {o.categoryName}
                        </span>
                        {/* Spent over budget, the same pair the dashboard's
                            Categories card shows — the two numbers that are
                            simply true right now. Everything derived from them
                            (projected, its overshoot, fixed, pace) waits in the
                            panel: a row carrying five figures stops being
                            readable at a glance, which is the whole point of
                            the bar. */}
                        <span
                          className={`shrink-0 text-[13px] font-semibold tabular-nums ${
                            left < 0 ? "text-destructive" : "text-muted-foreground"
                          }`}
                        >
                          {fmt0(c.consumed)}
                          <span className="text-muted-foreground/50">
                            <span className="mx-1">/</span>
                            {fmt0(c.assigned)}
                          </span>
                        </span>
                        <ChevronRight
                          className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${
                            isOpen ? "rotate-90" : ""
                          }`}
                        />
                      </button>

                      {isOpen && (
                        <div className="space-y-2 rounded-b-lg border border-t-0 bg-muted/40 p-3 text-xs">
                          {/* The detail is where the full numbers belong.
                              Right-aligned like every amount below it, so the
                              last column lands on the same edge as the
                              composition and transaction figures. */}
                          <dl className="grid grid-cols-4 gap-2 text-right">
                            <div>
                              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                {t("objectives.spent")}
                              </dt>
                              <dd className="font-semibold tabular-nums">{fmt0(c.consumed)}</dd>
                            </div>
                            <div>
                              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                {t("objectives.budget")}
                              </dt>
                              <dd className="font-semibold tabular-nums text-muted-foreground">
                                {fmt0(c.assigned)}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                {t("objectives.projected")}
                              </dt>
                              <dd
                                className={`font-semibold tabular-nums ${
                                  c.state === "OK" ? "" : pctTone
                                }`}
                              >
                                {fmt0(c.projectedEndOfMonth)}
                              </dd>
                            </div>
                            <div>
                              {/* Pace explains a projection built from a run
                                  rate; on a committed budget it explains
                                  nothing, so that slot shows the commitment. */}
                              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                {c.fixedTotal > 0
                                  ? t("objectives.fixed")
                                  : t("objectives.pace")}
                              </dt>
                              <dd className="font-semibold tabular-nums text-muted-foreground">
                                {c.fixedTotal > 0 ? fmt0(c.fixedTotal) : `${elapsedPct}%`}
                              </dd>
                            </div>
                          </dl>
                          {/* Composition: recurring base + manual extra. */}
                          {(o.recurrings.length > 0 || o.extra > 0) && (
                            <ul className="space-y-1">
                              {o.recurrings.map((r, i) => (
                                <li
                                  key={i}
                                  className="flex items-center justify-between gap-2"
                                >
                                  <span className="min-w-0 truncate text-muted-foreground">
                                    <Repeat className="mr-1 inline h-3 w-3" />
                                    {r.description}
                                  </span>
                                  <span className="shrink-0 tabular-nums">
                                    {fmt(r.amount)}
                                  </span>
                                </li>
                              ))}
                              {o.extra > 0 && (
                                <li className="flex items-center justify-between gap-2">
                                  <span className="text-muted-foreground">
                                    {t("objectives.manual")}
                                  </span>
                                  <span className="shrink-0 tabular-nums">
                                    {fmt(o.extra)}
                                  </span>
                                </li>
                              )}
                            </ul>
                          )}

                          {o.transactions.length > 0 && (
                            <ul className="max-h-40 space-y-1 overflow-y-auto border-t pt-2">
                              {o.transactions.map((t, i) => (
                                <li
                                  key={i}
                                  className="flex items-center justify-between gap-2 text-muted-foreground"
                                >
                                  <span className="shrink-0 tabular-nums">
                                    {t.date.slice(8, 10)}/{t.date.slice(5, 7)}
                                  </span>
                                  <span className="min-w-0 flex-1 truncate">
                                    {t.description}
                                  </span>
                                  <span className="shrink-0 tabular-nums">
                                    {fmt(t.amount)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}

                          {canWrite && (
                          /* `xs` + wrap: at `sm` the two labels overflowed the
                             panel on a phone. Short labels — the panel is
                             already about this category's manual amount. */
                          <div className="flex flex-wrap justify-end gap-2 border-t pt-2">
                            {o.extra > 0 && (
                              <Button
                                variant="ghost"
                                size="xs"
                                className="text-destructive hover:text-destructive"
                                onClick={() =>
                                  setConfirm({ categoryId: o.categoryId, name: o.categoryName })
                                }
                                disabled={isPending}
                              >
                                <Trash2 />
                                {t("common.remove")}
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="xs"
                              onClick={() =>
                                setDraft({
                                  categoryId: o.categoryId,
                                  assigned: String(o.extra),
                                  rollover: false,
                                  existing: true,
                                })
                              }
                              disabled={isPending}
                            >
                              <Pencil />
                              {o.extra > 0
                                ? t("objectives.editManual")
                                : t("objectives.addManual")}
                            </Button>
                          </div>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              </div>
            )}

            {funds.length > 0 && (
              <div className="space-y-3 border-t pt-3">
                <p className="text-xs font-medium text-muted-foreground">
                  {t("objectives.funds")}
                </p>
                <ul className="space-y-2">
                  {funds.map((o) => (
                    <li key={o.categoryId} className="text-sm">
                      <div className="flex items-center gap-3">
                        <PiggyBank className="h-3.5 w-3.5 shrink-0 text-success" />
                        {canWrite ? (
                        <button
                          type="button"
                          className="min-w-0 flex-1 truncate text-left font-medium hover:underline"
                          onClick={() =>
                            setDraft({
                              categoryId: o.categoryId,
                              assigned: String(o.assigned),
                              rollover: true,
                              existing: true,
                            })
                          }
                        >
                          {o.categoryName}
                        </button>
                        ) : (
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {o.categoryName}
                        </span>
                        )}
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {t("objectives.perMonth", { amount: fmt0(o.assigned) })}
                        </span>
                        <span
                          className={`w-16 shrink-0 text-right text-xs font-medium tabular-nums ${
                            (o.balance ?? 0) < 0 ? "text-destructive" : "text-success"
                          }`}
                        >
                          {fmt0(o.balance ?? 0)}
                        </span>
                        {canWrite && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-muted-foreground"
                          onClick={() =>
                            setConfirm({ categoryId: o.categoryId, name: o.categoryName })
                          }
                          disabled={isPending}
                          title={t("objectives.removeFund")}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>

      <Dialog
        open={draft !== null}
        onOpenChange={(o) => {
          if (!o) setDraft(null);
        }}
      >
        <DialogContent className="pt-8 sm:w-[min(96vw,420px)] sm:max-w-[min(96vw,420px)]">
          <DialogTitle>
            {draft?.rollover
              ? t("objectives.dialog.fund")
              : t("objectives.dialog.objective")}
          </DialogTitle>
          {draft && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t("objectives.dialog.category")}</Label>
              <CategorySelect
                defaultValue={draft.categoryId ?? undefined}
                onValueChange={(v) => setDraft({ ...draft, categoryId: v || null })}
                categories={categories}
                ariaLabel={t("objectives.dialog.categoryAria")}
                className="w-full"
                disabled={draft.existing}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="objective-amount">
                {t("objectives.dialog.amount", { currency })}
              </Label>
              <Input
                id="objective-amount"
                type="number"
                step="0.01"
                min="0"
                value={draft.assigned}
                onChange={(e) => setDraft({ ...draft, assigned: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                {t("objectives.dialog.amountHelp")}
              </p>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <Label htmlFor="objective-rollover">
                  {t("objectives.dialog.rollover")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("objectives.dialog.rolloverHelp")}
                </p>
              </div>
              <Switch
                id="objective-rollover"
                checked={draft.rollover}
                onCheckedChange={(v) => setDraft({ ...draft, rollover: v })}
              />
            </div>
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
        open={confirm !== null}
        onOpenChange={(o) => {
          if (!o && !isPending) setConfirm(null);
        }}
      >
        <DialogContent className="pt-8 sm:w-[min(96vw,420px)] sm:max-w-[min(96vw,420px)]">
          <DialogTitle>{t("objectives.remove.title")}</DialogTitle>
          {confirm && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              <RichText
                template={t("objectives.remove.body")}
                slots={{
                  name: (
                    <span className="font-medium text-foreground">{confirm.name}</span>
                  ),
                }}
              />
            </p>
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setConfirm(null)}
                disabled={isPending}
              >
                {t("common.cancel")}
              </Button>
              <Button variant="destructive" onClick={confirmedRemove} disabled={isPending}>
                {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {t("common.remove")}
              </Button>
            </div>
          </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
