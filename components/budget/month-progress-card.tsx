// Server component: how the month is actually going. Pure OBSERVATION — it
// moves when a transaction arrives, never because the user edited something.
// That is why it is a card of its own and not the bottom half of the plan.
//
// `Against plan` compares with the plan accrued TO DATE, not the whole
// month's. Against the whole month this card was red from the 1st to the 26th
// by construction (charges land in the first week, salaries on the 27th), and
// an indicator that is red half of every month teaches you to ignore red —
// which then costs you the warnings that do matter. See
// `lib/budget/cascade.ts` → `expectedResultToDate`.
//
// The consolidated balance and the months of cushion used to sit here. They
// are not facts about THIS month — they do not move when August's decisions
// change — so they live on /accounts now.

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/formatters";
import { discrepancyIsMaterial } from "@/lib/budget/cascade";
import type { MonthStatus } from "@/lib/budget/month-status";
import { ProvisionalBadge } from "@/components/budget/provisional-badge";

export function MonthProgressCard({
  status,
  currency,
  locale,
}: {
  status: MonthStatus;
  currency: string;
  locale: string;
}) {
  const fmt = (n: number) => formatCurrency(n, currency, locale);
  const signed = (n: number) => `${n >= 0 ? "+" : "−"}${fmt(Math.abs(n))}`;
  const tone = (n: number) => (n >= 0 ? "text-success" : "text-destructive");
  const { reconciliation: r } = status;
  const showGap = discrepancyIsMaterial(
    r.discrepancy,
    r.actualIncome + r.actualExpenses
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          How the month is going
          {status.provisional && (
            <span className="ml-2">
              <ProvisionalBadge />
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="space-y-1.5 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">This month&apos;s balance</dt>
            <dd className="tabular-nums">{signed(r.actualResult)}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Against plan so far</dt>
            <dd className={`tabular-nums ${tone(r.performance)}`}>
              {signed(r.performance)}
            </dd>
          </div>
          {r.consolidatedDelta != null && (
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Actual savings</dt>
              <dd className={`tabular-nums ${tone(r.consolidatedDelta)}`}>
                {signed(r.consolidatedDelta)}
              </dd>
            </div>
          )}
        </dl>

        {/* Written for whoever has to act on it, not for whoever wrote the
            check. Only when it is material — see discrepancyIsMaterial. */}
        {showGap && r.discrepancy != null && (
          <p className="rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
            {fmt(Math.abs(r.discrepancy))} moved through your accounts without a
            matching transaction. Check whether an account still has to sync.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
