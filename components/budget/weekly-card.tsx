// Server component: the operating number — what is left to SPEND between now
// and Sunday — followed by what has already been spent this week.
//
// v6, a second legibility pass, after the v5 card was shown to its user again:
// "difícil de entender y poco vistoso". Two things were wrong with it, and
// they are different in kind.
//
// 1. IT TOLD THE OVERSPENT MONTH IN THE WORDS OF THE HEALTHY ONE. `remaining
//    Month` had gone to −248,16 €, so the daily rate came out at −15,51 € and
//    the card printed, in order: `To spend this week  −15,51 €`, `1 day ×
//    −15,51 € a day`, `−248,16 € left for the rest of the month`. Every figure
//    was arithmetically right and the sentence was nonsense — nobody can spend
//    a negative amount per day, and "left" of a negative number is a
//    contradiction. The sign is a STATE, not a value: `weeklyHeadline` in
//    lib/budget/weekly.ts now returns which of the two stories to tell, past
//    the budget there is 0 to spend, and how far past is said in its own
//    words.
// 2. IT HAD NO SHAPE. Six unrelated figures stacked in grey. The month meter
//    is the missing piece: one bar carrying the spend against the budget with
//    a mark where the calendar has got to, so "ahead of pace" is a glance
//    rather than a subtraction. The week's composition rows get the same
//    treatment — a proportional bar in the category's colour instead of a dot,
//    which is the one thing a reader wants from that list (who took the
//    money) and the shape says it before the numbers do.
//
// What did NOT change, because it was right: the card answers two questions
// under two labels — what can I still spend, and what have I spent — and the
// composition carries no limits and no traffic lights (half the categories are
// episodic; a weekly budget on them would cry wolf the week shoes get bought).

import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatCurrency, formatCurrencyRound } from "@/lib/formatters";
import type { WeeklyStatus } from "@/lib/budget/month-status";
import { isoWeekEnd, monthMeter, weeklyHeadline } from "@/lib/budget/weekly";
import { CalendarRange } from "lucide-react";
import { getT } from "@/lib/i18n/server";
import { UI_LOCALE_TAGS } from "@/lib/i18n/locales";
import { RichText } from "@/components/i18n/rich-text";

/**
 * The month behind the week: budget consumed, with a hairline where the
 * calendar stands. Built here rather than from `components/ui/progress`
 * because that primitive carries one value and this needs the second mark —
 * without the reference the fill says nothing (objectives-card.tsx draws its
 * bars for the same reason).
 *
 * `aria-hidden`: every number in it is already stated in the caption below, so
 * to a screen reader this is decoration of that sentence, not new information.
 */
function MonthMeter({ spentPct, elapsedPct, over }: { spentPct: number; elapsedPct: number; over: boolean }) {
  return (
    <div aria-hidden className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={`h-full rounded-full transition-all ${over ? "bg-destructive" : "bg-brand"}`}
        style={{ width: `${spentPct}%` }}
      />
      {/* Where the month has got to. Hidden once the bar is full: with the
          whole track painted, a mark inside it reads as a division of the
          spend rather than as the calendar. */}
      {spentPct < 100 && (
        <span
          className="absolute inset-y-0 w-px bg-foreground/40"
          style={{ left: `${elapsedPct}%` }}
        />
      )}
    </div>
  );
}

export async function WeeklyCard({
  status,
  currency,
  locale,
}: {
  status: WeeklyStatus;
  currency: string;
  locale: string;
}) {
  const fmt = (n: number) => formatCurrency(n, currency, locale);
  // Cents on a zero are noise: the point of the figure is that there is none.
  const fmt0 = (n: number) => formatCurrencyRound(n, currency, locale);
  const t = await getT();

  if (!status.configured) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t("weekly.title")}</CardTitle>
          <CalendarRange className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            <RichText
              template={t("weekly.notConfigured")}
              slots={{
                link: (
                  <Link
                    href="/plan"
                    className="text-brand underline-offset-2 hover:underline"
                  >
                    {t("nav.budget")}
                  </Link>
                ),
              }}
            />
          </p>
        </CardContent>
      </Card>
    );
  }

  const headline = weeklyHeadline(status.weekly);
  const meter = monthMeter({
    variableBudget: status.cascade.variableBudget,
    variableSpentMonth: status.variableSpentMonth,
    today: status.today,
    daysInMonth: status.daysInMonth,
  });
  const opsTone =
    status.opsMedian > 0 && status.opsThisWeek > status.opsMedian
      ? "text-warning"
      : "text-muted-foreground";
  // The weekday closing the window, named in the LANGUAGE OF THE INTERFACE —
  // not in the user's date-format preference, which is a separate setting and
  // would otherwise put "Hasta el Sunday" on a Spanish screen.
  const weekday = new Date(`${isoWeekEnd(status.today)}T00:00:00Z`).toLocaleDateString(
    UI_LOCALE_TAGS[t.locale],
    { weekday: "long", timeZone: "UTC" }
  );
  // Share of the week's spend, for the composition bars. Guarded: a week whose
  // transactions net to zero must not paint NaN-wide bars.
  const weekTotal = status.composition.reduce((sum, row) => sum + row.spent, 0);
  const share = (spent: number) => (weekTotal > 0 ? Math.min(100, (spent / weekTotal) * 100) : 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="min-w-0 space-y-1">
          <CardTitle className="text-sm font-medium">{t("weekly.title")}</CardTitle>
          <CardDescription className="text-xs">
            {t("weekly.until", { weekday })}
          </CardDescription>
        </div>
        <CalendarRange className="h-4 w-4 shrink-0 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {headline.kind === "available" ? (
          <>
            <p className="text-3xl font-bold tabular-nums">{fmt(headline.amount)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t.plural("weekly.breakdown", headline.daysLeftInWeek, {
                amount: fmt(headline.dailyRate),
              })}
            </p>
          </>
        ) : (
          <>
            {/* Zero, not the overspend, is the answer to "what can I spend" —
                the overshoot is a different figure and gets its own line. */}
            <p className="text-3xl font-bold tabular-nums text-muted-foreground">{fmt0(0)}</p>
            <p className="mt-1 text-xs font-medium text-destructive">
              {t("weekly.overBudget", { amount: fmt(headline.overspent) })}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("weekly.nothingLeft", { weekday })}
            </p>
          </>
        )}

        <div className="mt-4 space-y-1.5">
          <MonthMeter spentPct={meter.spentPct} elapsedPct={meter.elapsedPct} over={meter.over} />
          <p className="text-xs text-muted-foreground">
            {headline.kind === "available" ? (
              <>
                {t("weekly.left", { amount: fmt(meter.remaining) })}
                {" · "}
              </>
            ) : null}
            {t("weekly.dayOfMonth", { day: meter.dayOfMonth, days: status.daysInMonth })}
          </p>
        </div>

        <div className="mt-4 border-t pt-3">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium">{t("weekly.spentTitle")}</span>
            <span className="shrink-0 tabular-nums">{fmt(status.spentThisWeek)}</span>
          </div>
          <p className={`mt-0.5 text-xs tabular-nums ${opsTone}`}>
            {t.plural("weekly.ops", status.opsThisWeek)}
            {status.opsMedian > 0
              ? ` · ${t("weekly.opsMedian", { median: Math.round(status.opsMedian) })}`
              : ""}
          </p>

          {status.composition.length > 0 && (
            <ul className="mt-3 space-y-2.5 text-xs">
              {status.composition.slice(0, 3).map((row) => (
                <li key={row.categoryId ?? "uncategorized"} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 flex-1 truncate">
                      {row.categoryId ? row.categoryName : t("weekly.uncategorized")}
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {fmt(row.spent)} · {t.plural("weekly.ops", row.count)}
                    </span>
                  </div>
                  {/* Share of the week, in the category's own colour — the
                      question this list answers is who took the money, and a
                      length answers it before the figures are read. */}
                  <div aria-hidden className="h-1 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${share(row.spent)}%`,
                        backgroundColor: row.categoryColor ?? "var(--muted-foreground)",
                      }}
                    />
                  </div>
                </li>
              ))}
              {status.composition.length > 3 && (
                <li className="text-muted-foreground/70">
                  {t("weekly.more", { count: status.composition.length - 3 })}
                </li>
              )}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
