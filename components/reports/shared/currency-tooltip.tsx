"use client";

import { formatCurrency } from "@/lib/formatters";
import { chartTooltipStyle } from "./chart-style";

interface TooltipPayloadItem {
  name?: string | number;
  value?: number | string;
  color?: string;
  payload?: { color?: string };
}

// Theme-aware Recharts tooltip that formats values as currency. Used via
// <Tooltip content={renderCurrencyTooltip(currency, locale)} />.
export function renderCurrencyTooltip(currency: string, locale: string) {
  function CurrencyTooltip(props: {
    active?: boolean;
    label?: string | number;
    payload?: TooltipPayloadItem[];
  }) {
    const { active, label, payload } = props;
    if (!active || !payload?.length) return null;

    return (
      <div style={chartTooltipStyle}>
        {label !== undefined && label !== "" && (
          <div className="mb-1 font-medium">{label}</div>
        )}
        {payload.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: item.color ?? item.payload?.color ?? "var(--foreground)" }}
            />
            {item.name !== undefined && (
              <span className="text-muted-foreground">{item.name}</span>
            )}
            <span className="ml-auto pl-3 font-medium tabular-nums">
              {formatCurrency(Number(item.value ?? 0), currency, locale)}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return <CurrencyTooltip />;
}
