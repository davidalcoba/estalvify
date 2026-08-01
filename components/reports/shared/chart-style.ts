import type { CSSProperties } from "react";

// Shared, theme-aware Recharts styling. Uses semantic CSS tokens so charts read
// correctly in light and dark. The categorical series use the --chart-* tokens
// defined in app/globals.css.

export const chartTooltipStyle: CSSProperties = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "0.5rem",
  color: "var(--popover-foreground)",
  fontSize: "0.75rem",
  padding: "0.5rem 0.625rem",
  boxShadow: "0 4px 12px rgb(0 0 0 / 0.12)",
};

// Note: Recharts `tick` expects SVG text attributes, not CSSProperties.
export const axisTickStyle = {
  fill: "var(--muted-foreground)",
  fontSize: 12,
};

export const chartGridStroke = "var(--border)";

// Palette for series that don't carry their own color.
export const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];
