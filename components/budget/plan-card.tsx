// Server component: the v4 monthly cascade — the savings TARGET is the input
// and what's left to spend is the residue. One mode only: move the target,
// watch the spendable move.
//
// This card holds DECISIONS. It only changes when the user edits something,
// which is why it is separate from "How the month is going", which only
// changes when a transaction arrives. Reading `Savings target −860` next to
// `Actual savings +4.597` as if they were comparable is the confusion that
// split them: one is a choice, the other a partial fact.
//
// Vocabulary rule (UI_RULES → "No database words on screen"): no `rollover`,
// no `variable budget`, no `accrual`. The labels say what the number means to
// a person, not how it is computed.

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/formatters";
import type { MonthStatus } from "@/lib/budget/month-status";
import { SavingsTargetInput } from "@/components/budget/savings-target-input";
import { InlineNotice, RaiseSavingsAction } from "@/components/budget/inline-notice";

export function PlanCard({
  status,
  currency,
  locale,
}: {
  status: MonthStatus;
  currency: string;
  locale: string;
}) {
  const fmt = (n: number) => formatCurrency(n, currency, locale);
  const { cascade } = status;
  // Positive gap = the category lines add up to MORE than the month can
  // afford; negative = there is money nobody has claimed yet.
  const gap = cascade.assignmentGap;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Your plan</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="space-y-1.5 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Money coming in</dt>
            <dd className="tabular-nums text-success">+{fmt(cascade.expectedIncome)}</dd>
          </div>
          {/* A line at zero is not information, and "−0,00 €" is worse than
              not information. Only the savings target is unconditional: it is
              the input of the whole cascade and has to stay reachable even at
              zero. */}
          {cascade.expectedCharges > 0 && (
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Fixed costs</dt>
              <dd className="tabular-nums">−{fmt(cascade.expectedCharges)}</dd>
            </div>
          )}
          {cascade.rolloverQuotas > 0 && (
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Set aside for later</dt>
              <dd className="tabular-nums">−{fmt(cascade.rolloverQuotas)}</dd>
            </div>
          )}
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Savings target</dt>
            <dd>
              <SavingsTargetInput
                year={status.year}
                month={status.month}
                value={cascade.savingsTarget}
                currency={currency}
                locale={locale}
              />
            </dd>
          </div>
          {/* The conclusion of the whole screen, sized like one. */}
          <div className="flex items-baseline justify-between border-t pt-2.5">
            <dt className="font-medium">To spend this month</dt>
            <dd className="text-2xl font-semibold tabular-nums">
              {fmt(cascade.variableBudget)}
            </dd>
          </div>
        </dl>

        {/* The one line on this screen that asks for an action. Figure plus
            action on the surface, the sentence behind the ⓘ. Silent when the
            split squares. */}
        {Math.abs(gap) > 1 && (
          <InlineNotice
            figure={
              gap < 0
                ? `${fmt(Math.abs(gap))} unassigned`
                : `${fmt(gap)} over-assigned`
            }
            detail={
              gap < 0
                ? "Your categories claim less than the month can afford. Hand the rest to a category, or raise your savings target so it is saved instead of drifting."
                : "Your categories claim more than the month can afford. Spend all of it and you will miss the savings target."
            }
            action={<RaiseSavingsAction />}
          />
        )}
      </CardContent>
    </Card>
  );
}
