"use client";

// Rollover funds: budget assignments whose remainder rolls into next month —
// the IBI, holidays, the car. Same object as a classic budget line, one
// boolean apart. Balance is derived server-side; this card edits the quota.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PiggyBank, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type Category } from "@/components/categorize/category-options";
import { CategorySelect } from "@/components/categorize/category-select";
import { formatCurrency } from "@/lib/formatters";
import type { RolloverFundStatus } from "@/lib/budget/month-status";
import { upsertRolloverFund, removeRolloverFund } from "@/app/(app)/plan/actions";

interface FundsCardProps {
  funds: RolloverFundStatus[];
  categories: Category[];
  year: number;
  month: number;
  currency: string;
  locale: string;
}

export function FundsCard({ funds, categories, year, month, currency, locale }: FundsCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState<{ categoryId: string | null; assigned: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fmt = (n: number) => formatCurrency(n, currency, locale);

  function save() {
    if (!draft?.categoryId) {
      setError("Pick a category");
      return;
    }
    const assigned = Number(draft.assigned);
    if (!Number.isFinite(assigned) || assigned < 0) {
      setError("Invalid quota");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await upsertRolloverFund(draft.categoryId!, year, month, assigned);
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
        await removeRolloverFund(categoryId, year, month);
        router.refresh();
      } catch {
        // refresh restores truth
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Rollover funds</CardTitle>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setDraft({ categoryId: null, assigned: "" })}
          disabled={isPending}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Fund
        </Button>
      </CardHeader>
      <CardContent>
        {funds.length === 0 ? (
          <div className="flex items-start gap-3 text-sm text-muted-foreground">
            <PiggyBank className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Provision monthly for the foreseeable lumps — IBI, holidays, the
              car, back-to-school. The unspent remainder rolls into next month,
              so the available number stops lying for months at a time.
            </p>
          </div>
        ) : (
          <ul className="divide-y">
            {funds.map((fund) => (
              <li key={fund.categoryId} className="flex items-center gap-3 py-2 text-sm">
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left font-medium hover:underline"
                  onClick={() =>
                    setDraft({ categoryId: fund.categoryId, assigned: String(fund.assigned) })
                  }
                >
                  {fund.categoryName}
                </button>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {fmt(fund.assigned)}/mo
                </span>
                <span
                  className={`w-24 shrink-0 text-right tabular-nums ${
                    fund.balance < 0 ? "text-destructive" : ""
                  }`}
                >
                  {fmt(fund.balance)}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground"
                  onClick={() => remove(fund.categoryId)}
                  disabled={isPending}
                  title="Remove fund (this month onward)"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={draft !== null} onOpenChange={(o) => { if (!o) setDraft(null); }}>
        <DialogContent className="w-[min(96vw,420px)] pt-8 px-6 pb-6">
          <DialogTitle>Rollover fund</DialogTitle>
          {draft && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <CategorySelect
                  defaultValue={draft.categoryId ?? undefined}
                  onValueChange={(v) => setDraft({ ...draft, categoryId: v || null })}
                  categories={categories}
                  ariaLabel="Fund category"
                  className="w-full"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fund-quota">Monthly quota ({currency})</Label>
                <Input
                  id="fund-quota"
                  type="number"
                  step="0.01"
                  min="0"
                  value={draft.assigned}
                  onChange={(e) => setDraft({ ...draft, assigned: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Copied forward automatically each month; the remainder rolls.
                </p>
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
