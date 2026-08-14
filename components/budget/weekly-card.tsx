// Server component: the operating number — what is left to SPEND between now
// and Sunday — followed by what has already been spent this week.
//
// v5, a legibility pass. The card used to print five figures with almost no
// labels: `387,75 €  16 ops · mediana 49.5` over `129,25 €/día · quedan
// 2326,41 €`, then an unheaded list of categories. Read cold, none of it says
// what it is — the ops counter sits beside a euro amount and reads as money,
// `quedan` never says of what, and the category list could as easily be
// budgets as spending. It was shown to its own user and the verdict was "I
// don't understand any of this box".
//
// So the card now separates the two questions it answers, each under its own
// label:
//
//   1. WHAT CAN I STILL SPEND — the big number, with the arithmetic that
//      produces it spelled out underneath (`3 días × 129,25 € al día`) and
//      the window it covers in the card description (`Hasta el domingo`).
//      A derived figure the reader cannot reconstruct is not information.
//   2. WHAT HAVE I SPENT — the week's total, its operation count against the
//      12-week median, and the composition by category (informative: no
//      limits, no traffic lights; half the categories are episodic and a
//      weekly budget on them would cry wolf the week shoes get bought).
//
// The counters moved into (2) because that is what they describe: they are a
// property of the spending, not of the money left.

import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatCurrency } from "@/lib/formatters";
import type { WeeklyStatus } from "@/lib/budget/month-status";
import { isoWeekEnd } from "@/lib/budget/weekly";
import { CalendarRange } from "lucide-react";
import { getT } from "@/lib/i18n/server";
import { UI_LOCALE_TAGS } from "@/lib/i18n/locales";
import { RichText } from "@/components/i18n/rich-text";

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

  const { weekly } = status;
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
        <p
          className={`text-3xl font-bold tabular-nums ${
            weekly.availableThisWeek < 0 ? "text-destructive" : ""
          }`}
        >
          {fmt(weekly.availableThisWeek)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t.plural("weekly.breakdown", weekly.daysLeftInWeek, {
            amount: fmt(weekly.dailyRate),
          })}
        </p>
        <p className="text-xs text-muted-foreground">
          {t("weekly.left", { amount: fmt(weekly.remainingMonth) })}
        </p>

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
            <ul className="mt-2 space-y-1 text-xs">
              {status.composition.slice(0, 3).map((row) => (
                <li
                  key={row.categoryId ?? "uncategorized"}
                  className="flex items-center gap-2 text-muted-foreground"
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: row.categoryColor ?? "var(--muted-foreground)" }}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {row.categoryId ? row.categoryName : t("weekly.uncategorized")}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {fmt(row.spent)} · {t.plural("weekly.ops", row.count)}
                  </span>
                </li>
              ))}
              {status.composition.length > 3 && (
                <li className="pl-4 text-muted-foreground/70">
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
