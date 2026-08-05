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
import { formatCurrency } from "@/lib/formatters";
import type { CategoryObjective, IncomeObjective } from "@/lib/budget/month-status";
import { upsertBudgetObjective, removeBudgetObjective } from "@/app/(app)/plan/actions";

interface ObjectivesCardProps {
  objectives: CategoryObjective[];
  incomeObjectives: IncomeObjective[];
  /** 0–1, how much of the month has elapsed — the pace reference. */
  monthElapsed: number;
  categories: Category[];
  year: number;
  month: number;
  currency: string;
  locale: string;
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
  monthElapsed,
  categories,
  year,
  month,
  currency,
  locale,
}: ObjectivesCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirm, setConfirm] = useState<{ categoryId: string; name: string } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fmt = (n: number) => formatCurrency(n, currency, locale);
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

  const variables = objectives.filter((o) => !o.rollover);
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
      </CardHeader>
      <CardContent className="space-y-4">
        {incomeObjectives.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground">Income</p>
            <ul className="space-y-4">
              {incomeObjectives.map((o) => {
                const receivedPct =
                  o.expected > 0 ? Math.round((o.received / o.expected) * 100) : 0;
                const key = `income:${o.categoryId}`;
                const isOpen = expandedId === key;
                return (
                  <li key={key} className="text-sm">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-1 text-left font-medium"
                        onClick={() => setExpandedId(isOpen ? null : key)}
                        aria-expanded={isOpen}
                      >
                        <ChevronRight
                          className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${
                            isOpen ? "rotate-90" : ""
                          }`}
                        />
                        <span
                          className="inline-block h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: o.categoryColor }}
                        />
                        <span className="min-w-0 truncate">{o.categoryName}</span>
                      </button>
                      <span className="hidden shrink-0 tabular-nums text-muted-foreground sm:inline">
                        {fmt(o.received)}
                        <span className="text-muted-foreground/60"> / {fmt(o.expected)}</span>
                      </span>
                      <span
                        className={`w-12 shrink-0 text-right text-xs font-medium tabular-nums ${
                          receivedPct >= 100 ? "text-success" : "text-muted-foreground"
                        }`}
                      >
                        {receivedPct}%
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2 pl-4 text-xs sm:hidden">
                      <span className="tabular-nums text-muted-foreground">
                        {fmt(o.received)}
                        <span className="text-muted-foreground/60"> / {fmt(o.expected)}</span>
                      </span>
                    </div>
                    <div className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                      {/* Inverted polarity: filling up is good — income arriving. */}
                      <div
                        className="h-full rounded-full bg-success"
                        style={{ width: `${Math.min(100, receivedPct)}%` }}
                      />
                    </div>

                    {isOpen && o.recurrings.length > 0 && (
                      <ul className="mt-2 space-y-1 rounded-md bg-muted/40 p-3 text-xs">
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
            {variables.length > 0 && (
              <div className={incomeObjectives.length > 0 ? "space-y-3 border-t pt-3" : "space-y-3"}>
              <p className="text-xs font-medium text-muted-foreground">Charges</p>
              <ul className="space-y-4">
                {variables.map((o) => {
                  const consumedPct =
                    o.assigned > 0 ? Math.round((o.consumed / o.assigned) * 100) : 0;
                  const over = o.consumed > o.assigned;
                  const ahead = consumedPct > elapsedPct;
                  const pctTone = over
                    ? "text-destructive"
                    : ahead
                      ? "text-warning"
                      : "text-muted-foreground";
                  const isOpen = expandedId === o.categoryId;
                  return (
                    <li key={o.categoryId} className="text-sm">
                      {/* One line on desktop; on mobile the amounts wrap to
                          their own line so the name never crushes them.
                          Tapping the name unfolds the composition. */}
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-1 text-left font-medium"
                          onClick={() => setExpandedId(isOpen ? null : o.categoryId)}
                          aria-expanded={isOpen}
                        >
                          <ChevronRight
                            className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${
                              isOpen ? "rotate-90" : ""
                            }`}
                          />
                          <span
                            className="inline-block h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: o.categoryColor }}
                          />
                          <span className="min-w-0 truncate">{o.categoryName}</span>
                        </button>
                        <span className="hidden shrink-0 tabular-nums text-muted-foreground sm:inline">
                          {fmt(o.consumed)}
                          <span className="text-muted-foreground/60"> / {fmt(o.assigned)}</span>
                        </span>
                        <span
                          className={`w-12 shrink-0 text-right text-xs font-medium tabular-nums ${pctTone}`}
                        >
                          {consumedPct}%
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2 pl-4 text-xs sm:hidden">
                        <span className="tabular-nums text-muted-foreground">
                          {fmt(o.consumed)}
                          <span className="text-muted-foreground/60"> / {fmt(o.assigned)}</span>
                        </span>
                      </div>
                      <div className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full ${
                            over ? "bg-destructive" : ahead ? "bg-warning" : "bg-primary"
                          }`}
                          style={{ width: `${Math.min(100, consumedPct)}%` }}
                        />
                        {/* Pace marker: where the month is. */}
                        <div
                          className="absolute top-0 h-full w-0.5 bg-foreground/50"
                          style={{ left: `${elapsedPct}%` }}
                        />
                      </div>

                      {isOpen && (
                        <div className="mt-2 space-y-2 rounded-md bg-muted/40 p-3 text-xs">
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

                          <div className="flex justify-end gap-2 border-t pt-2">
                            {o.extra > 0 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-destructive hover:text-destructive"
                                onClick={() =>
                                  setConfirm({ categoryId: o.categoryId, name: o.categoryName })
                                }
                                disabled={isPending}
                              >
                                <Trash2 className="mr-1 h-3 w-3" />
                                Remove manual
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7"
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
                              <Pencil className="mr-1 h-3 w-3" />
                              {o.extra > 0 ? "Edit manual amount" : "Add manual amount"}
                            </Button>
                          </div>
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
                        <span className="hidden shrink-0 text-xs tabular-nums text-muted-foreground sm:inline">
                          {fmt(o.assigned)}/mo
                        </span>
                        <span
                          className={`hidden w-24 shrink-0 text-right tabular-nums sm:inline ${
                            (o.balance ?? 0) < 0 ? "text-destructive" : "text-success"
                          }`}
                        >
                          {fmt(o.balance ?? 0)}
                        </span>
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
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2 pl-6 text-xs sm:hidden">
                        <span className="tabular-nums text-muted-foreground">
                          {fmt(o.assigned)}/mo
                        </span>
                        <span
                          className={`tabular-nums ${
                            (o.balance ?? 0) < 0 ? "text-destructive" : "text-success"
                          }`}
                        >
                          {fmt(o.balance ?? 0)}
                        </span>
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
