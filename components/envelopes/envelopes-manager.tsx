"use client";

// Labeled split of the savings balance (STOCK — never part of the monthly
// assignment cycle). Locked envelopes are structural: the emergency fund is
// not up for grabs.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, LockOpen, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { formatCurrency } from "@/lib/formatters";
import {
  createEnvelope,
  updateEnvelope,
  deleteEnvelope,
  type EnvelopeFields,
} from "@/app/(app)/envelopes/actions";

export interface EnvelopeVM {
  id: string;
  name: string;
  amount: number;
  locked: boolean;
}

interface EnvelopesManagerProps {
  envelopes: EnvelopeVM[];
  /** Derived rollover-fund balances shown alongside (not editable here). */
  fundBalances: { name: string; balance: number }[];
  savingsBalance: number | null;
  currency: string;
  locale: string;
}

export function EnvelopesManager({
  envelopes,
  fundBalances,
  savingsBalance,
  currency,
  locale,
}: EnvelopesManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState<(EnvelopeFields & { id: string | null }) | null>(null);
  const [amountText, setAmountText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fmt = (n: number) => formatCurrency(n, currency, locale);

  const assigned =
    envelopes.reduce((sum, e) => sum + e.amount, 0) +
    fundBalances.reduce((sum, f) => sum + Math.max(0, f.balance), 0);
  const unassigned = savingsBalance != null ? savingsBalance - assigned : null;

  function save() {
    if (!draft) return;
    const amount = Number(amountText);
    setError(null);
    startTransition(async () => {
      try {
        const fields = { name: draft.name, amount, locked: draft.locked };
        if (draft.id) await updateEnvelope(draft.id, fields);
        else await createEnvelope(fields);
        setDraft(null);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save");
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Savings envelopes</CardTitle>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setDraft({ id: null, name: "", amount: 0, locked: true });
            setAmountText("");
          }}
          disabled={isPending}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Envelope
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="divide-y">
          {envelopes.map((e) => (
            <li key={e.id} className="flex items-center gap-3 py-2 text-sm">
              {e.locked ? (
                <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <LockOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left font-medium hover:underline"
                onClick={() => {
                  setDraft({ id: e.id, name: e.name, amount: e.amount, locked: e.locked });
                  setAmountText(String(e.amount));
                }}
              >
                {e.name}
              </button>
              <span className="shrink-0 tabular-nums">{fmt(e.amount)}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground"
                onClick={() =>
                  startTransition(async () => {
                    await deleteEnvelope(e.id);
                    router.refresh();
                  })
                }
                disabled={isPending}
                title="Delete envelope"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
          {fundBalances.map((f) => (
            <li key={`fund-${f.name}`} className="flex items-center gap-3 py-2 text-sm text-muted-foreground">
              <Lock className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">
                {f.name} <span className="text-xs">(rollover fund — managed on Monthly control)</span>
              </span>
              <span className="shrink-0 tabular-nums">{fmt(Math.max(0, f.balance))}</span>
              <span className="w-7 shrink-0" />
            </li>
          ))}
        </ul>
        {unassigned != null && (
          <p className={`border-t pt-2 text-xs ${unassigned < 0 ? "text-destructive" : "text-muted-foreground"}`}>
            {unassigned < 0
              ? `Envelopes exceed the savings balance by ${fmt(Math.abs(unassigned))} — the labels promise money that isn't there.`
              : `Unlabeled: ${fmt(unassigned)} of the savings balance.`}
          </p>
        )}
      </CardContent>

      <Dialog open={draft !== null} onOpenChange={(o) => { if (!o) setDraft(null); }}>
        <DialogContent className="w-[min(96vw,420px)] pt-8 px-6 pb-6">
          <DialogTitle>{draft?.id ? "Edit envelope" : "New envelope"}</DialogTitle>
          {draft && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="env-name">Name</Label>
                <Input
                  id="env-name"
                  placeholder="Emergency fund"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="env-amount">Amount ({currency})</Label>
                <Input
                  id="env-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={amountText}
                  onChange={(e) => setAmountText(e.target.value)}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={draft.locked}
                  onCheckedChange={(c) => setDraft({ ...draft, locked: c === true })}
                />
                Locked (structural — never offered for spending)
              </label>
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
