"use client";

import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  const [localQuery, setLocalQuery] = useState(query);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function navigate(params: Record<string, string>) {
    const next = new URLSearchParams(searchParams.toString());
    Object.entries(params).forEach(([k, v]) => {
      if (v) next.set(k, v);
      else next.delete(k);
    });
    next.set("page", "1");
    router.push(`/transactions?${next.toString()}`);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    navigate({ from: fd.get("from") as string, to: fd.get("to") as string });
  }

  function handleQueryChange(value: string) {
    setLocalQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.length === 0 || value.length >= 3) {
      debounceRef.current = setTimeout(() => {
        navigate({ q: value.trim() });
      }, 500);
    }
  }

  function handleQuerySubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    navigate({ q: localQuery.trim() });
  }

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
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

      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <Input type="date" name="from" defaultValue={from} className="h-9 w-full sm:w-[150px] text-sm" />
        <Input type="date" name="to" defaultValue={to} className="h-9 w-full sm:w-[150px] text-sm" />
        <Button type="submit" size="sm" className="h-9 px-4 text-sm shrink-0">
          Apply
        </Button>
      </form>

      <form onSubmit={handleQuerySubmit} className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          name="q"
          value={localQuery}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="Filter by description, merchant, reference…"
          className="h-9 w-full pl-9 pr-3 text-sm"
        />
      </form>
    </div>
  );
}
