// Server component: the single number — variable budget minus variable spend —
// plus pace and per-day, and nothing else. Fixed charges are already deducted
// upstream in the commitments, so rent leaving the account does not move this
// number; 140 small card payments do.

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/formatters";
import type { MonthStatus } from "@/lib/plan/month-status";
import { Wallet } from "lucide-react";

export function AvailableCard({
  status,
  currency,
  locale,
}: {
  status: MonthStatus;
  currency: string;
  locale: string;
}) {
  const fmt = (n: number) => formatCurrency(n, currency, locale);
  const { available, commitments, spend } = {
    available: status.available,
    commitments: status.commitments,
    spend: status.spend,
  };

  if (!status.hasPlan) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Available to spend</CardTitle>
          <Wallet className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Add your expected income and standing charges to the{" "}
            <Link href="/plan" className="text-brand underline-offset-2 hover:underline">
              Plan
            </Link>{" "}
            to get one number: what you can still spend this month.
          </p>
        </CardContent>
      </Card>
    );
  }

  const pace = available.paceRatio;
  const paceTone =
    pace == null
      ? "text-muted-foreground"
      : pace <= 1
        ? "text-success"
        : pace <= 1.15
          ? "text-warning"
          : "text-destructive";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Available to spend</CardTitle>
        <Wallet className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div
          className={`text-3xl font-bold tabular-nums ${
            available.available < 0 ? "text-destructive" : ""
          }`}
        >
          {fmt(available.available)}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          of {fmt(commitments.variableBudget)} variable budget ·{" "}
          {fmt(spend.variable)} spent
        </p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {pace != null && (
            <span className={paceTone}>
              Pace {Math.round(pace * 100)}%
              {pace > 1 ? " — spending fast" : ""}
            </span>
          )}
          <span className="text-muted-foreground">
            {available.daysLeft} days left
            {available.perDayLeft > 0 ? ` · ${fmt(available.perDayLeft)}/day` : ""}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
