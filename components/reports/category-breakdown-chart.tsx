"use client";

import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { formatCurrency } from "@/lib/formatters";
import { renderCurrencyTooltip } from "./shared/currency-tooltip";

export interface CategorySlice {
  name: string;
  value: number;
  color: string;
}

// Donut of spending by category with a compact legend. Slice colors come from
// the category's own color (hex from the DB).
export function CategoryBreakdownChart({
  data,
  currency,
  locale,
  height = 220,
}: {
  data: CategorySlice[];
  currency: string;
  locale: string;
  height?: number;
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div style={{ width: "100%", maxWidth: 220, height }} className="mx-auto sm:mx-0">
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="58%"
              outerRadius="100%"
              paddingAngle={1}
              stroke="var(--background)"
              strokeWidth={2}
            >
              {data.map((slice) => (
                <Cell key={slice.name} fill={slice.color} />
              ))}
            </Pie>
            <Tooltip content={renderCurrencyTooltip(currency, locale)} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <ul className="flex-1 space-y-1.5">
        {data.map((slice) => {
          const pct = total > 0 ? Math.round((slice.value / total) * 100) : 0;
          return (
            <li key={slice.name} className="flex items-center gap-2 text-sm">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: slice.color }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate">{slice.name}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {formatCurrency(slice.value, currency, locale)}
              </span>
              <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {pct}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
