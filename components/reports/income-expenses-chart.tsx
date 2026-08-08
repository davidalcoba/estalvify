"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { formatCurrency } from "@/lib/formatters";
import { axisTickStyle, chartGridStroke } from "./shared/chart-style";
import { renderCurrencyTooltip } from "./shared/currency-tooltip";
import { useT } from "@/components/i18n/i18n-provider";

export interface IncomeExpensesDatum {
  label: string;
  income: number;
  expenses: number;
}

// Grouped bars: income vs expenses per month. Theme-aware via CSS tokens.
export function IncomeExpensesChart({
  data,
  currency,
  locale,
  height = 260,
}: {
  data: IncomeExpensesDatum[];
  currency: string;
  locale: string;
  height?: number;
}) {
  const t = useT();
  const compact = (value: number) =>
    formatCurrency(value, currency, locale).replace(/[.,]00(?=\D*$)/, "");

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid vertical={false} stroke={chartGridStroke} strokeDasharray="3 3" />
          <XAxis dataKey="label" tick={axisTickStyle} tickLine={false} axisLine={false} />
          <YAxis
            tick={axisTickStyle}
            tickLine={false}
            axisLine={false}
            width={72}
            tickFormatter={compact}
          />
          <Tooltip
            cursor={{ fill: "var(--accent)", opacity: 0.35 }}
            content={renderCurrencyTooltip(currency, locale)}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar
            dataKey="income"
            name={t("reports.chart.income")}
            fill="var(--chart-2)"
            radius={[4, 4, 0, 0]}
          />
          <Bar
            dataKey="expenses"
            name={t("reports.chart.expenses")}
            fill="var(--chart-1)"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
