// Server component: compact category status for the daily screen — one line
// per manual objective, week and month, tone by control state. No prose.
//
// Laid out as a grid, not as flex rows with fixed-width number columns: those
// align only as long as you guess the widest amount right, and the day you
// guess low the numbers spill out of the card (they did — `197,80 €/200,00 €`
// in a `w-24`). The grid sizes the two amount columns to their widest cell and
// gives the name `minmax(0,1fr)`, so the name truncates and nothing can
// overflow. Amounts are whole euros here — cents are noise in a glanceable
// list, and they were most of the width.

import { Fragment } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrencyRound } from "@/lib/formatters";
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
  const fmt0 = (n: number) => formatCurrencyRound(n, currency, locale);

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
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-1.5 text-sm">
          <span aria-hidden />
          <span aria-hidden />
          <span className="text-right text-[10px] uppercase tracking-wide text-muted-foreground/70">
            Week
          </span>
          <span className="text-right text-[10px] uppercase tracking-wide text-muted-foreground/70">
            Month
          </span>
          {control.map((c) => {
            const tone =
              c.state === "EXCEDIDO"
                ? "text-destructive"
                : c.state === "RIESGO"
                  ? "text-warning"
                  : "text-muted-foreground";
            // Cells go straight into the parent grid — no wrapper row, so no
            // dependence on `subgrid` for the columns to line up.
            return (
              <Fragment key={c.categoryId}>
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: c.categoryColor }}
                />
                <span className="truncate">{c.categoryName}</span>
                <span className="whitespace-nowrap text-right tabular-nums text-muted-foreground">
                  {c.weekConsumed > 0 ? fmt0(c.weekConsumed) : "—"}
                </span>
                <span className={`whitespace-nowrap text-right tabular-nums ${tone}`}>
                  {fmt0(c.consumed)}
                  <span className="text-muted-foreground/50">
                    <span className="mx-1">/</span>
                    {fmt0(c.assigned)}
                  </span>
                </span>
              </Fragment>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
