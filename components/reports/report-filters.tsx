"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { SimpleSelect } from "@/components/ui/simple-select";
import { Button } from "@/components/ui/button";
import { ALL_ACCOUNTS, TREND_WINDOWS } from "@/lib/analytics/report-filters";

export interface ReportAccountOption {
  id: string;
  name: string;
  iban: string | null;
}

export interface ReportMonthOption {
  /** `YYYY-MM` */
  value: string;
  /** Already localized on the server, where the user's language lives. */
  label: string;
}

interface ReportFiltersProps {
  month: string;
  trend: number;
  accountId: string;
  months: ReportMonthOption[];
  accounts: ReportAccountOption[];
  /** True when any filter is off its default — drives the reset button. */
  isFiltered: boolean;
}

// Filter bar for the Reports page. Every control writes to the URL, so a
// filtered view is shareable and the back button walks the history.
export function ReportFilters({
  month,
  trend,
  accountId,
  months,
  accounts,
  isFiltered,
}: ReportFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function navigate(params: Record<string, string>) {
    const next = new URLSearchParams(searchParams.toString());
    Object.entries(params).forEach(([key, value]) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });
    const query = next.toString();
    router.push(query ? `/reports?${query}` : "/reports");
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:flex-wrap sm:items-center">
      <SimpleSelect
        value={month}
        onValueChange={(value) => navigate({ month: value })}
        ariaLabel="Report month"
        className="w-full sm:w-[190px]"
        options={months}
      />

      <SimpleSelect
        value={String(trend)}
        onValueChange={(value) => navigate({ trend: value })}
        ariaLabel="Trend window"
        className="w-full sm:w-[170px]"
        options={TREND_WINDOWS.map((n) => ({
          value: String(n),
          label: `Last ${n} months`,
        }))}
      />

      {accounts.length > 1 && (
        <SimpleSelect
          value={accountId || ALL_ACCOUNTS}
          onValueChange={(value) =>
            navigate({ accountId: value === ALL_ACCOUNTS ? "" : value })
          }
          ariaLabel="Filter by account"
          className="w-full sm:w-[260px]"
          options={[
            { value: ALL_ACCOUNTS, label: "All accounts" },
            ...accounts.map((a) => ({
              value: a.id,
              label: `${a.name}${a.iban ? ` (${a.iban.slice(-4)})` : ""}`,
            })),
          ]}
        />
      )}

      {isFiltered && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 self-start sm:ml-auto"
          onClick={() => navigate({ month: "", trend: "", accountId: "" })}
        >
          Reset
        </Button>
      )}
    </div>
  );
}
