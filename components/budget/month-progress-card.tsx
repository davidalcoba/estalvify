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
//
// `Actual savings` is the change between the month's opening and closing
// balance, both anchored on real bank readings and walked over the ledger
// where a reading is missing (`lib/budget/balance-history.ts`). The warning
// below is no longer "this month's change does not match this month's flows"
// but "two real readings do not agree with the ledger between them", which is
// the same question asked where it can actually be answered.

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/formatters";
import { InlineNotice } from "@/components/budget/inline-notice";
import { discrepancyIsMaterial } from "@/lib/budget/cascade";
import type { MonthStatus } from "@/lib/budget/month-status";
import { ProvisionalBadge } from "@/components/budget/provisional-badge";
import { getT } from "@/lib/i18n/server";

export async function MonthProgressCard({
  status,
  currency,
  locale,
}: {
  status: MonthStatus;
  currency: string;
  locale: string;
}) {
  const fmt = (n: number) => formatCurrency(n, currency, locale);
  const t = await getT();
  const signed = (n: number) => `${n >= 0 ? "+" : "−"}${fmt(Math.abs(n))}`;
  const tone = (n: number) => (n >= 0 ? "text-success" : "text-destructive");
  const { reconciliation: r } = status;
  // Scaled to the window the gap actually spans, which is anchor-to-anchor and
  // can be two months wide when the sync was down — not to this month's flow.
  const showGap = discrepancyIsMaterial(r.discrepancy, r.discrepancyGrossFlow);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {t("progress.title")}
          {status.provisional && (
            <span className="ml-2">
              <ProvisionalBadge />
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="space-y-1.5 text-sm">
          {/* First, because it is the only line here that can be acted on
              while the month runs. The two cash figures below are negative
              from the 1st to the 26th no matter how the month is going — the
              charges land in the first week and the salaries on the 27th — so
              leading with them says "disaster" every month until it is too
              late to change anything. */}
          <div className="flex items-baseline justify-between">
            <dt className="font-medium">{t("progress.headingFor")}</dt>
            <dd className="text-lg font-semibold tabular-nums">
              {signed(r.projectedResult)}
            </dd>
          </div>
          {/* The one judgement on the card. Everything else is a fact. */}
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">{t("progress.againstPlan")}</dt>
            <dd className={`tabular-nums ${tone(r.performance)}`}>
              {signed(r.performance)}
            </dd>
          </div>
          {/* Deliberately uncoloured: red here would fire on 26 days out of
              31 by construction, which is the habit that makes people stop
              reading red. */}
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">{t("progress.balance")}</dt>
            <dd className="tabular-nums text-muted-foreground">
              {signed(r.actualResult)}
            </dd>
          </div>
          {/* Actual savings is the balance change, so a failed reconciliation
              is precisely a statement that this figure is wrong: the gap below
              IS the difference between it and the balance above. Painting it
              green at full weight next to a warning saying it does not add up
              was the card contradicting itself. When the gap is material the
              figure drops to muted and says so — a number the app knows is
              unreliable must not look like one that isn't. */}
          {/* No opening balance near the month's start means the change
              cannot be measured — say so instead of leaving a silent hole
              where a figure used to be, or worse, quoting one measured from
              eight weeks earlier. */}
          {r.openingBalanceUnknown && (
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">{t("progress.actualSavings")}</dt>
              <dd className="text-xs text-muted-foreground">
                {t("progress.noReading")}
              </dd>
            </div>
          )}
          {r.consolidatedDelta != null && (
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">{t("progress.actualSavings")}</dt>
              <dd className="flex items-center gap-1.5 tabular-nums text-muted-foreground">
                {showGap && (
                  <span className="rounded-sm bg-muted px-1 py-px text-[10px] font-medium uppercase tracking-wide">
                    {t("progress.unreliable")}
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
            figure={t("progress.unreconciled", {
              amount: fmt(Math.abs(r.discrepancy)),
            })}
            detail={t("progress.unreconciled.detail")}
            action={
              <Link
                href="/accounts"
                className="shrink-0 font-medium underline underline-offset-2"
              >
                {t("progress.checkAccounts")}
              </Link>
            }
          />
        )}
      </CardContent>
    </Card>
  );
}
