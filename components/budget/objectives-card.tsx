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
  categories,
  year,
  month,
  currency,
  locale,
}: ObjectivesCardProps) {
  const router = useRouter();
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
      setError("Pick a category");
      return;
    }
    const assigned = Number(draft.assigned);
    if (!Number.isFinite(assigned) || assigned < 0) {
      setError("Invalid amount");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await upsertBudgetObjective(draft.categoryId!, year, month, assigned, draft.rollover);
        setDraft(null);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save");
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
          Objectives
          <span className="ml-2 align-middle text-xs font-normal text-muted-foreground">
            {elapsedPct}% elapsed
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
          Add
        </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {incomeObjectives.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground">Income</p>
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
                      <span
                        className={`shrink-0 text-[13px] font-semibold tabular-nums ${
                          pending > 0.005 ? "text-muted-foreground" : "text-success"
                        }`}
                      >
                        {pending > 0.005 ? fmt0(pending) : "✓"}
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
                              Received
                            </dt>
                            <dd className="font-semibold tabular-nums">{fmt0(o.received)}</dd>
                          </div>
                          <div>
                            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              Expected
                            </dt>
                            <dd className="font-semibold tabular-nums text-muted-foreground">
                              {fmt0(o.expected)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              Pace
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
            <p>Assign a monthly budget per category.</p>
          </div>
        ) : (
          <>
            {control.length > 0 && (
              <div className={incomeObjectives.length > 0 ? "space-y-3 border-t pt-3" : "space-y-3"}>
              <p className="text-xs font-medium text-muted-foreground">Charges</p>
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
                        {c.state !== "OK" && (
                          <span
                            className="absolute inset-y-0 right-0 -z-10 w-[3px]"
                            style={{ background: tone }}
                          />
                        )}
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
                        {c.projectedDeviation > 0 && (
                          <span
                            className={`shrink-0 rounded-full px-1.5 py-px text-[11px] font-bold tabular-nums ${pctTone}`}
                            style={{ background: `color-mix(in oklch, ${tone} 16%, transparent)` }}
                          >
                            +{fmt0(c.projectedDeviation)}
                          </span>
                        )}
                        <span
                          className={`shrink-0 text-[13px] font-semibold tabular-nums ${
                            left < 0 ? "text-destructive" : "text-muted-foreground"
                          }`}
                        >
                          {fmt0(left)}
                        </span>
                        <ChevronRight
                          className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${
                            isOpen ? "rotate-90" : ""
                          }`}
                        />
                      </button>

                      {isOpen && (
                        <div className="space-y-2 rounded-b-lg border border-t-0 bg-muted/40 p-3 text-xs">
                          {/* The detail is where the full numbers belong. */}
                          <dl className="grid grid-cols-4 gap-2">
                            <div>
                              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                Spent
                              </dt>
                              <dd className="font-semibold tabular-nums">{fmt0(c.consumed)}</dd>
                            </div>
                            <div>
                              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                Budget
                              </dt>
                              <dd className="font-semibold tabular-nums text-muted-foreground">
                                {fmt0(c.assigned)}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                Projected
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
                                {c.fixedTotal > 0 ? "Fixed" : "Pace"}
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
                                  <span className="text-muted-foreground">Manual</span>
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
                                Remove
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
                              {o.extra > 0 ? "Edit manual" : "Add manual"}
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
                  Rollover funds
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
                          {fmt0(o.assigned)}/mo
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
                          title="Remove fund (this month onward)"
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
          <DialogTitle>{draft?.rollover ? "Rollover fund" : "Category objective"}</DialogTitle>
          {draft && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <CategorySelect
                defaultValue={draft.categoryId ?? undefined}
                onValueChange={(v) => setDraft({ ...draft, categoryId: v || null })}
                categories={categories}
                ariaLabel="Objective category"
                className="w-full"
                disabled={draft.existing}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="objective-amount">Manual amount ({currency})</Label>
              <Input
                id="objective-amount"
                type="number"
                step="0.01"
                min="0"
                value={draft.assigned}
                onChange={(e) => setDraft({ ...draft, assigned: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                On top of the category&apos;s recurring charges; copied forward
                each month.
              </p>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <Label htmlFor="objective-rollover">Rollover</Label>
                <p className="text-xs text-muted-foreground">
                  The unspent remainder accumulates month over month.
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
        open={confirm !== null}
        onOpenChange={(o) => {
          if (!o && !isPending) setConfirm(null);
        }}
      >
        <DialogContent className="pt-8 sm:w-[min(96vw,420px)] sm:max-w-[min(96vw,420px)]">
          <DialogTitle>Remove manual amount?</DialogTitle>
          {confirm && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              The manual amount of{" "}
              <span className="font-medium text-foreground">{confirm.name}</span>{" "}
              stops counting from this month on. Its recurring charges stay,
              and past months keep everything.
            </p>
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setConfirm(null)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button variant="destructive" onClick={confirmedRemove} disabled={isPending}>
                {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Remove
              </Button>
            </div>
          </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
