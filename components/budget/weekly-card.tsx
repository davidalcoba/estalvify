// Server component: the operating number — available THIS WEEK — plus the
// operations counter against its 12-week median, and the week's composition
// (informative: no limits, no traffic lights; half the categories are episodic
// and a weekly budget on them would cry wolf the week shoes get bought).

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/formatters";
import type { WeeklyStatus } from "@/lib/budget/month-status";
import { CalendarRange } from "lucide-react";
import { getT } from "@/lib/i18n/server";
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

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{t("weekly.title")}</CardTitle>
        <CalendarRange className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <span
            className={`text-3xl font-bold tabular-nums ${
              weekly.availableThisWeek < 0 ? "text-destructive" : ""
            }`}
          >
            {fmt(weekly.availableThisWeek)}
          </span>
          <span className={`text-sm tabular-nums ${opsTone}`}>
            {t("weekly.ops", { count: status.opsThisWeek })}
            {status.opsMedian > 0
              ? t("weekly.opsMedian", { median: status.opsMedian })
              : ""}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("weekly.perDay", { amount: fmt(weekly.dailyRate) })} ·{" "}
          {t("weekly.left", { amount: fmt(weekly.remainingMonth) })}
        </p>

        {status.composition.length > 0 && (
          <ul className="mt-3 space-y-1 border-t pt-2 text-xs">
            {status.composition.slice(0, 3).map((row) => (
              <li
                key={row.categoryId ?? "uncategorized"}
                className="flex items-center justify-between gap-2 text-muted-foreground"
              >
                <span className="min-w-0 truncate">{row.categoryName}</span>
                <span className="shrink-0 tabular-nums">
                  {fmt(row.spent)} · {t("weekly.ops", { count: row.count })}
                </span>
              </li>
            ))}
            {status.composition.length > 3 && (
              <li className="text-muted-foreground/70">
                {t("weekly.more", { count: status.composition.length - 3 })}
              </li>
            )}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
