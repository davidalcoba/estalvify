"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const PRESETS = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "3 months", days: 90 },
  { label: "1 year", days: 365 },
];

interface Account {
  id: string;
  name: string;
  iban: string | null;
}

interface TransactionFiltersProps {
  from: string;
  to: string;
  accountId: string;
  accounts: Account[];
}

export function TransactionFilters({ from, to, accountId, accounts }: TransactionFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const formRef = useRef<HTMLFormElement>(null);

  function navigate(params: Record<string, string>) {
    const next = new URLSearchParams(searchParams.toString());
    Object.entries(params).forEach(([k, v]) => {
      if (v) next.set(k, v);
      else next.delete(k);
    });
    next.set("page", "1");
    router.push(`/transactions?${next.toString()}`);
  }

  function applyPreset(days: number) {
    const toDate = new Date();
    const fromDate = new Date(Date.now() - days * 86_400_000);
    navigate({
      from: fromDate.toISOString().split("T")[0],
      to: toDate.toISOString().split("T")[0],
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const fromVal = fd.get("from") as string;
    const toVal = fd.get("to") as string;
    if (fromVal && toVal) navigate({ from: fromVal, to: toVal });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Account selector */}
      {accounts.length > 1 && (
        <>
          <select
            value={accountId}
            onChange={(e) => navigate({ accountId: e.target.value })}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.iban ? ` (${a.iban.slice(-4)})` : ""}
              </option>
            ))}
          </select>
          <div className="w-px h-5 bg-border mx-1 hidden sm:block" />
        </>
      )}

      {/* Date presets */}
      {PRESETS.map((p) => (
        <Button
          key={p.label}
          variant="outline"
          size="sm"
          onClick={() => applyPreset(p.days)}
          className="h-8 text-xs"
        >
          {p.label}
        </Button>
      ))}

      <div className="w-px h-5 bg-border mx-1 hidden sm:block" />

      {/* Custom date range */}
      <form ref={formRef} onSubmit={handleSubmit} className="flex items-center gap-1.5">
        <Input
          type="date"
          name="from"
          defaultValue={from}
          className="h-8 w-36 text-xs"
        />
        <span className="text-muted-foreground text-xs">–</span>
        <Input
          type="date"
          name="to"
          defaultValue={to}
          className="h-8 w-36 text-xs"
        />
        <Button type="submit" size="sm" className="h-8 text-xs">
          Apply
        </Button>
      </form>
    </div>
  );
}

