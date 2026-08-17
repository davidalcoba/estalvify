// Server component: what is about to leave the account, for the daily screen.
//
// The weekly figure above it is an allowance, and an allowance is unreadable
// on its own — 47 € until Sunday means one thing with the month's charges paid
// and quite another with 600 € of them landing on Friday. This card is that
// missing half, and it is the only thing on the dashboard that looks forward
// past the week.
//
// Deliberately not a second Upcoming screen: no chart, no month grouping, no
// per-account coverage. The next few dates, what leaves on each, and one total
// — everything heavier is a tap away on /forecast, which the footer of the
// card links to.
//
// Laid out on a grid rather than as flex rows with a fixed date column: the
// date strings vary by language ("mañana" vs "tomorrow" vs "dj. 20") and any
// width guessed here truncates a description on the day the guess is wrong
// (the same reasoning as control-mini.tsx).

import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AlertTriangle, CalendarClock, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency, formatCurrencyRound, formatDate } from "@/lib/formatters";
import type { Upcoming, UpcomingRow } from "@/lib/planned/upcoming";
import { getT } from "@/lib/i18n/server";

/** How many rows before the card stops being a glance. */
const ROWS = 5;

export async function UpcomingMini({
  upcoming,
  currency,
  locale,
  language,
  className,
}: {
  upcoming: Upcoming;
  currency: string;
  /** Number/currency formatting locale (the member's preference). */
  locale: string;
  /** Date formatting locale — a separate preference from `locale`. */
  language: string;
  className?: string;
}) {
  const t = await getT();
  const fmt = (n: number) => formatCurrency(n, currency, locale);
  const fmt0 = (n: number) => formatCurrencyRound(n, currency, locale);

  // "today" and "tomorrow" beat a date the reader has to place against the
  // calendar; past that, the weekday is what makes a date land ("Friday the
  // 21st" is a plan, "2026-08-21" is a lookup).
  const when = (row: UpcomingRow) => {
    if (row.daysAway === 0) return t("upcoming.today");
    if (row.daysAway === 1) return t("upcoming.tomorrow");
    return formatDate(`${row.date}T00:00:00Z`, language, "UTC", {
      weekday: "short",
      day: "numeric",
    });
  };

  const rows = upcoming.rows.slice(0, ROWS);
  const hidden = upcoming.rows.length - rows.length;

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="min-w-0 space-y-1">
          <CardTitle className="text-sm font-medium">
            <Link href="/forecast" className="hover:underline">
              {t("upcoming.title")}
            </Link>
          </CardTitle>
          {/* What the figures ARE, in one line — the card's own rule since the
              week card printed five unlabelled numbers. */}
          <CardDescription className="text-xs">
            {upcoming.pendingOut > 0
              ? t("upcoming.subtitle", {
                  days: upcoming.horizonDays,
                  amount: fmt0(upcoming.pendingOut),
                })
              : t("upcoming.subtitleEmpty", { days: upcoming.horizonDays })}
          </CardDescription>
        </div>
        <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground" />
      </CardHeader>

      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("upcoming.empty")}</p>
        ) : (
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-2 text-sm">
            {rows.map((row) => {
              const matched = row.status === "MATCHED";
              return (
                <div key={row.id} className="col-span-3 grid grid-cols-subgrid items-baseline">
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {when(row)}
                  </span>
                  <span className="flex min-w-0 items-baseline gap-1.5">
                    <span className={cn("truncate", matched && "text-muted-foreground")}>
                      {row.description}
                    </span>
                    {matched && (
                      <Check className="size-3 shrink-0 self-center text-success" aria-hidden />
                    )}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 tabular-nums",
                      row.direction === "CREDIT" ? "text-success" : "text-foreground",
                      matched && "text-muted-foreground",
                    )}
                  >
                    {row.direction === "CREDIT" ? "+" : "−"}
                    {fmt(row.shownAmount)}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* A charge whose window closed with nothing in it. Out of the list on
            purpose: the list is ordered soonest-first, which buried the one row
            that asks for an action below the row limit. */}
        {upcoming.missed.length > 0 && (
          <p className="mt-3 flex items-baseline gap-1.5 text-xs text-destructive">
            <AlertTriangle className="size-3 shrink-0 self-center" aria-hidden />
            {upcoming.missed.length === 1
              ? t("upcoming.missedOne", { name: upcoming.missed[0].description })
              : t.plural("upcoming.missedCount", upcoming.missed.length)}
          </p>
        )}

        {hidden > 0 && (
          <p className="mt-3 text-xs">
            <Link
              href="/forecast"
              className="text-muted-foreground underline-offset-4 hover:underline"
            >
              {t("upcoming.more", { count: hidden })}
            </Link>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
