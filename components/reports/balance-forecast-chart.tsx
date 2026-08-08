"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { formatCurrency } from "@/lib/formatters";
import { axisTickStyle, chartGridStroke } from "./shared/chart-style";
import { renderCurrencyTooltip } from "./shared/currency-tooltip";
import { useT } from "@/components/i18n/i18n-provider";

export interface ForecastDatum {
  label: string;
  balance: number;
}

// Projected running balance over the coming months. Turns red if it dips below
// the threshold (default 0). Theme-aware via CSS tokens.
export function BalanceForecastChart({
  data,
  currency,
  locale,
  threshold = 0,
  height = 260,
}: {
  data: ForecastDatum[];
  currency: string;
  locale: string;
  threshold?: number;
  height?: number;
}) {
  const t = useT();
  const dipsBelow = data.some((d) => d.balance < threshold);
  const stroke = dipsBelow ? "var(--destructive)" : "var(--chart-2)";

  const compact = (value: number) =>
    formatCurrency(value, currency, locale).replace(/[.,]00(?=\D*$)/, "");

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <defs>
            <linearGradient id="forecastFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.25} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={chartGridStroke} strokeDasharray="3 3" />
          <XAxis dataKey="label" tick={axisTickStyle} tickLine={false} axisLine={false} />
          <YAxis
            tick={axisTickStyle}
            tickLine={false}
            axisLine={false}
            width={72}
            tickFormatter={compact}
          />
          <ReferenceLine y={threshold} stroke="var(--border)" strokeDasharray="4 4" />
          <Tooltip content={renderCurrencyTooltip(currency, locale)} />
          <Area
            type="monotone"
            dataKey="balance"
            name={t("reports.chart.projectedBalance")}
            stroke={stroke}
            strokeWidth={2}
            fill="url(#forecastFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
