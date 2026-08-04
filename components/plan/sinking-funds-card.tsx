"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PiggyBank, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { formatCurrency, formatDate } from "@/lib/formatters";
import type { SinkingFundStatus } from "@/lib/plan/month-status";
import {
  createSinkingFund,
  updateSinkingFund,
  deleteSinkingFund,
  type SinkingFundFields,
} from "@/app/(app)/plan/actions";

interface SinkingFundsCardProps {
  funds: SinkingFundStatus[];
  currency: string;
  locale: string;
  dateLocale: string;
}

interface Draft {
  id: string | null;
  name: string;
  targetAmount: string;
  targetDate: string;
  monthlyContribution: string;
  initialAmount: string;
}

const EMPTY_DRAFT: Draft = {
  id: null,
  name: "",
  targetAmount: "",
  targetDate: "",
  monthlyContribution: "",
  initialAmount: "0",
};

// Sinking funds: provision monthly for the foreseeable lumps (IBI, holidays,
// back-to-school) so they stop wrecking the month they land in. Internal
// accounting — the money sits in the savings account.
export function SinkingFundsCard({
  funds,
  currency,
  locale,
  dateLocale,
}: SinkingFundsCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);

  function openEdit(fund: SinkingFundStatus) {
    setDraft({
      id: fund.id,
      name: fund.name,
      targetAmount: String(fund.targetAmount),
      targetDate: fund.targetDate ?? "",
      monthlyContribution: String(fund.monthlyContribution),
      initialAmount: String(fund.initialAmount),
    });
  }

  function submit() {
    if (!draft) return;
    const fields: SinkingFundFields = {
      name: draft.name,
      targetAmount: Number(draft.targetAmount),
      targetDate: draft.targetDate || null,
      monthlyContribution: Number(draft.monthlyContribution),
      initialAmount: Number(draft.initialAmount || "0"),
    };
    setError(null);
    startTransition(async () => {
      try {
        if (draft.id) await updateSinkingFund(draft.id, fields);
        else await createSinkingFund(fields);
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
        await deleteSinkingFund(id);
        router.refresh();
      } catch {
        // A refresh restores the true state.
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Sinking funds</CardTitle>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setDraft({ ...EMPTY_DRAFT })}
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
              Provision monthly for the big non-monthly hits — IBI, holidays,
              back-to-school, car repairs — so they stop blowing up the month
              they land in. Contributions count as commitments, next to the
              savings goal.
            </p>
          </div>
        ) : (
          <ul className="space-y-4">
            {funds.map((fund) => (
              <li key={fund.id} className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm">
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left font-medium hover:underline"
                    onClick={() => openEdit(fund)}
                  >
                    {fund.name}
                  </button>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {formatCurrency(fund.accrued, currency, locale)} /{" "}
                    {formatCurrency(fund.targetAmount, currency, locale)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-muted-foreground"
                    onClick={() => remove(fund.id)}
                    disabled={isPending}
                    title="Delete fund"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <Progress
                  value={Math.min(100, (fund.accrued / fund.targetAmount) * 100)}
                />
                <p className="text-xs text-muted-foreground">
                  {fund.funded ? (
                    "Funded — contributions stopped"
                  ) : (
                    <>
                      {formatCurrency(fund.monthlyContribution, currency, locale)}
                      /month
                      {fund.targetDate
                        ? ` · due ${formatDate(fund.targetDate, dateLocale, "UTC", { month: "short", year: "numeric" })}`
                        : ""}
                    </>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={draft !== null} onOpenChange={(o) => { if (!o) setDraft(null); }}>
        <DialogContent className="w-[min(96vw,440px)] pt-8 px-6 pb-6">
          <DialogTitle>{draft?.id ? "Edit fund" : "New sinking fund"}</DialogTitle>
          {draft && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="fund-name">Name</Label>
                <Input
                  id="fund-name"
                  placeholder="IBI 2027"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="fund-target">Target ({currency})</Label>
                  <Input
                    id="fund-target"
                    type="number"
                    step="0.01"
                    min="0"
                    value={draft.targetAmount}
                    onChange={(e) =>
                      setDraft({ ...draft, targetAmount: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fund-monthly">Monthly ({currency})</Label>
                  <Input
                    id="fund-monthly"
                    type="number"
                    step="0.01"
                    min="0"
                    value={draft.monthlyContribution}
                    onChange={(e) =>
                      setDraft({ ...draft, monthlyContribution: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="fund-date">Due date (optional)</Label>
                  <Input
                    id="fund-date"
                    type="date"
                    value={draft.targetDate}
                    onChange={(e) =>
                      setDraft({ ...draft, targetDate: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fund-initial">Already saved</Label>
                  <Input
                    id="fund-initial"
                    type="number"
                    step="0.01"
                    min="0"
                    value={draft.initialAmount}
                    onChange={(e) =>
                      setDraft({ ...draft, initialAmount: e.target.value })
                    }
                  />
                </div>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <div className="flex items-center justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setDraft(null)} disabled={isPending}>
                  Cancel
                </Button>
                <Button onClick={submit} disabled={isPending}>
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
