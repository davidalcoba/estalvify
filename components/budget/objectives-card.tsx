"use client";

// Category objectives: the month's budget assignments, both kinds. A variable
// objective is judged by pace — % consumed is always shown NEXT TO % of month
// elapsed, never alone. A rollover fund has INVERTED polarity: assigning is
// accumulation, so its bar fills green as the quota is set aside — same
// widget, opposite meaning, visually distinct (piggy icon + balance).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PiggyBank, Plus, Target, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { type Category } from "@/components/categorize/category-options";
import { CategorySelect } from "@/components/categorize/category-select";
import { formatCurrency } from "@/lib/formatters";
import type { CategoryObjective } from "@/lib/budget/month-status";
import { upsertBudgetObjective, removeBudgetObjective } from "@/app/(app)/plan/actions";

interface ObjectivesCardProps {
  objectives: CategoryObjective[];
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

  function remove(categoryId: string) {
    startTransition(async () => {
      try {
        await removeBudgetObjective(categoryId, year, month);
        router.refresh();
      } catch {
        // refresh restores truth
      }
    });
  }

  const variables = objectives.filter((o) => !o.rollover);
  const funds = objectives.filter((o) => o.rollover);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">
          Category objectives
          <span className="ml-2 align-middle text-xs font-normal text-muted-foreground">
            {elapsedPct}% of the month elapsed
          </span>
        </CardTitle>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            setDraft({ categoryId: null, assigned: "", rollover: false, existing: false })
          }
          disabled={isPending}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Objective
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {objectives.length === 0 ? (
          <div className="flex items-start gap-3 text-sm text-muted-foreground">
            <Target className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Assign the variable budget per category — the sum becomes the
              month&apos;s variable budget in the cascade.
            </p>
          </div>
        ) : (
          <>
            {variables.length > 0 && (
              <ul className="space-y-3">
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
                  return (
                    <li key={o.categoryId} className="text-sm">
                      {/* One line on desktop; on mobile the amounts wrap to
                          their own line so the name never crushes them. */}
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          className="min-w-0 flex-1 truncate text-left font-medium hover:underline"
                          onClick={() =>
                            setDraft({
                              categoryId: o.categoryId,
                              assigned: String(o.assigned),
                              rollover: false,
                              existing: true,
                            })
                          }
                        >
                          <span
                            className="mr-2 inline-block h-2 w-2 rounded-full align-middle"
                            style={{ backgroundColor: o.categoryColor }}
                          />
                          {o.categoryName}
                        </button>
                        <span className="hidden shrink-0 tabular-nums text-muted-foreground sm:inline">
                          {fmt(o.consumed)} / {fmt(o.assigned)}
                        </span>
                        <span
                          className={`hidden w-20 shrink-0 text-right text-xs tabular-nums sm:inline ${pctTone}`}
                        >
                          {consumedPct}% · {elapsedPct}%
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-muted-foreground"
                          onClick={() => remove(o.categoryId)}
                          disabled={isPending}
                          title="Remove objective (this month onward)"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2 text-xs sm:hidden">
                        <span className="tabular-nums text-muted-foreground">
                          {fmt(o.consumed)} / {fmt(o.assigned)}
                        </span>
                        <span className={`tabular-nums ${pctTone}`}>
                          {consumedPct}% · {elapsedPct}%
                        </span>
                      </div>
                      <div className="relative mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
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
                    </li>
                  );
                })}
              </ul>
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
                          onClick={() => remove(o.categoryId)}
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

      <Dialog open={draft !== null} onOpenChange={(o) => { if (!o) setDraft(null); }}>
        <DialogContent className="w-[min(96vw,420px)] pt-8 px-6 pb-6">
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
                <Label htmlFor="objective-amount">Monthly amount ({currency})</Label>
                <Input
                  id="objective-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={draft.assigned}
                  onChange={(e) => setDraft({ ...draft, assigned: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Copied forward automatically each month.
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
    </Card>
  );
}
