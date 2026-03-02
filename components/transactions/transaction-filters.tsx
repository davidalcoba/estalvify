"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
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
  query: string;
  accounts: Account[];
}

export function TransactionFilters({ from, to, accountId, query, accounts }: TransactionFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

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
    const fromDate = new Date(toDate);
    fromDate.setDate(fromDate.getDate() - days);
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
    if (fromVal && toVal) {
      navigate({ from: fromVal, to: toVal });
    }
  }

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        {accounts.length > 1 && (
          <select
            value={accountId}
            onChange={(e) => navigate({ accountId: e.target.value })}
            className="h-9 w-full sm:w-[280px] min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.iban ? ` (${a.iban.slice(-4)})` : ""}
              </option>
            ))}
          </select>
        )}

        <div className="flex flex-wrap gap-2">
          <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
            {PRESETS.map((p) => (
              <Button
                key={p.label}
                variant="outline"
                size="sm"
                onClick={() => applyPreset(p.days)}
                className="h-9 text-sm"
              >
                {p.label}
              </Button>
            ))}
            <div className="mx-1 hidden h-5 w-px bg-border lg:block" />
            <Input type="date" name="from" defaultValue={from} className="h-9 w-full sm:w-[180px] text-sm" />
            <Input type="date" name="to" defaultValue={to} className="h-9 w-full sm:w-[180px] text-sm" />
            <Button type="submit" size="sm" className="h-9 px-4 text-sm">
              Apply
            </Button>
          </form>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          navigate({ q: (fd.get("q") as string).trim() });
        }}
        className="relative"
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Filter by description, merchant, reference…"
          className="h-9 w-full pl-9 pr-3 text-sm"
        />
      </form>
    </div>
  );
}
