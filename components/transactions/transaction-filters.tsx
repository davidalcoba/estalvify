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

interface TransactionFiltersProps {
  from: string;
  to: string;
}

export function TransactionFilters({ from, to }: TransactionFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const formRef = useRef<HTMLFormElement>(null);

  function navigate(params: Record<string, string>) {
    const next = new URLSearchParams(searchParams.toString());
    Object.entries(params).forEach(([k, v]) => next.set(k, v));
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
