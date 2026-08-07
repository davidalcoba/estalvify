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

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/formatters";
import { InlineNotice } from "@/components/budget/inline-notice";
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
          {/* Actual savings is the balance change, so a failed reconciliation
              is precisely a statement that this figure is wrong: the gap below
              IS the difference between it and the balance above. Painting it
              green at full weight next to a warning saying it does not add up
              was the card contradicting itself. When the gap is material the
              figure drops to muted and says so — a number the app knows is
              unreliable must not look like one that isn't. */}
          {r.consolidatedDelta != null && (
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Actual savings</dt>
              <dd
                className={`flex items-center gap-1.5 tabular-nums ${
                  showGap ? "text-muted-foreground" : tone(r.consolidatedDelta)
                }`}
              >
                {showGap && (
                  <span className="rounded-sm bg-muted px-1 py-px text-[10px] font-medium uppercase tracking-wide">
                    unreliable
                  </span>
                )}
                {signed(r.consolidatedDelta)}
              </dd>
            </div>
          )}
        </dl>

        {/* Figure and action on the surface, explanation behind the ⓘ. Only
            when it is material — see discrepancyIsMaterial. */}
        {showGap && r.discrepancy != null && (
          <InlineNotice
            figure={`${fmt(Math.abs(r.discrepancy))} unreconciled`}
            detail="Your account balances moved by more than the transactions explain, so anything derived from them — actual savings above — cannot be trusted this month. Usually an account that has not finished syncing."
            action={
              <Link href="/accounts" className="shrink-0 font-medium underline underline-offset-2">
                Check accounts
              </Link>
            }
          />
        )}
      </CardContent>
    </Card>
  );
}
