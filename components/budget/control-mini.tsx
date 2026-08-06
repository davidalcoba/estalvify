// Server component: compact category status for the daily screen — one line
// per manual objective, week and month, tone by control state. No prose.

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/formatters";
import type { ControlRow } from "@/lib/budget/control";
import { ListChecks } from "lucide-react";

export function ControlMini({
  control,
  currency,
  locale,
}: {
  control: ControlRow[];
  currency: string;
  locale: string;
}) {
  if (control.length === 0) return null;
  const fmt = (n: number) => formatCurrency(n, currency, locale);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">
          <Link href="/plan" className="hover:underline">
            Categories
          </Link>
        </CardTitle>
        <ListChecks className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="mb-1 flex justify-end gap-4 text-[10px] uppercase tracking-wide text-muted-foreground/70">
          <span className="w-16 text-right">Week</span>
          <span className="w-24 text-right">Month</span>
        </div>
        <ul className="space-y-1.5 text-sm">
          {control.map((c) => {
            const tone =
              c.state === "EXCEDIDO"
                ? "text-destructive"
                : c.state === "RIESGO"
                  ? "text-warning"
                  : "text-muted-foreground";
            return (
              <li key={c.categoryId} className="flex items-center gap-2">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: c.categoryColor }}
                />
                <span className="min-w-0 flex-1 truncate">{c.categoryName}</span>
                <span className="w-16 shrink-0 text-right tabular-nums text-muted-foreground">
                  {c.weekConsumed > 0 ? fmt(c.weekConsumed) : "—"}
                </span>
                <span className={`w-24 shrink-0 text-right tabular-nums ${tone}`}>
                  {fmt(c.consumed)}
                  <span className="text-muted-foreground/50">/{fmt(c.assigned)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
