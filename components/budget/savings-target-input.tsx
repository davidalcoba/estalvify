"use client";

// Inline editor for the monthly savings target — THE input of the v4 cascade.
// Editing it recalculates the variable budget (the residue) and the weekly
// available on the spot via revalidation.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { setSavingsTarget } from "@/app/(app)/plan/actions";
import { formatCurrency } from "@/lib/formatters";
import { Pencil } from "lucide-react";

export function SavingsTargetInput({
  year,
  month,
  value,
  currency,
  locale,
}: {
  year: number;
  month: number;
  value: number;
  currency: string;
  locale: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    const amount = Number(draft.replace(",", "."));
    setError(null);
    startTransition(async () => {
      try {
        const res = await setSavingsTarget(year, month, amount);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setEditing(false);
        router.refresh();
      } catch {
        setError("App updated — reload the page and retry.");
      }
    });
  }

  if (!editing) {
    return (
      <button
        type="button"
        className="inline-flex items-center gap-1.5 tabular-nums underline decoration-dotted underline-offset-4 hover:text-foreground"
        onClick={() => {
          setDraft(String(value));
          setEditing(true);
        }}
        aria-label="Edit savings target"
      >
        −{formatCurrency(value, currency, locale)}
        <Pencil className="h-3 w-3 text-muted-foreground" />
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <Input
        type="number"
        inputMode="decimal"
        min={0}
        step={50}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
        className="h-7 w-24 text-right tabular-nums"
        autoFocus
      />
      <Button size="sm" className="h-7 px-2" onClick={save} disabled={isPending}>
        {isPending ? "…" : "OK"}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
