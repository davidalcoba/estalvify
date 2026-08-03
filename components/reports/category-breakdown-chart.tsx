"use client";

import { useState } from "react";
import { ResponsiveContainer, PieChart, Pie, Cell, Sector } from "recharts";
import type { PieSectorShapeProps } from "recharts";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";

export interface CategorySlice {
  name: string;
  value: number;
  color: string;
}

/** How far the selected sector reaches past the ring, in px. */
const ACTIVE_REACH = 7;

/**
 * Donut of spending by category with a compact legend. Slice colors come from
 * the category's own color (hex from the DB).
 *
 * Selection is deliberately legend-first. A 1 % category is a two-pixel sliver
 * that no finger can hit, and the floating tooltip it used to open landed on
 * top of the donut — you covered the chart to read it. So the legend rows are
 * the control (a comfortable row-sized target each), the sectors mirror them,
 * and the reading happens in the hole in the middle where nothing is hidden.
 */
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

  // Hover previews, a click pins. Kept apart so moving the mouse away restores
  // the pinned slice instead of clearing the selection a tap just made.
  const [pinned, setPinned] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const activeIndex = hovered ?? pinned;
  const active = activeIndex === null ? null : (data[activeIndex] ?? null);

  const percent = (value: number) =>
    total > 0 ? Math.round((value / total) * 100) : 0;

  const togglePinned = (index: number) =>
    setPinned((current) => (current === index ? null : index));

  // Selected sector reaches out; the rest step back. A sliver cannot grow
  // enough to be read on its own, so the contrast has to come from both sides.
  const renderSector = (props: PieSectorShapeProps) => {
    const isActive = props.index === activeIndex;
    return (
      <Sector
        {...props}
        outerRadius={isActive ? props.outerRadius + ACTIVE_REACH : props.outerRadius}
        fillOpacity={activeIndex === null || isActive ? 1 : 0.35}
      />
    );
  };

  return (
    // `min-w-0` on the flex container and on the legend is load-bearing: without
    // it the legend rows' min-content width propagates up and pushes the whole
    // card past its column on a narrow phone.
    <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
      <div
        style={{ width: "100%", maxWidth: 220, height }}
        // Two browser artifacts to suppress, both of which drew a stray box
        // around the donut when you tapped a slice: the iOS tap highlight, and
        // the focus ring the chart's <svg> takes on click. The svg is out of
        // the tab order (see below), so nothing accessible is lost.
        className="relative mx-auto shrink-0 [-webkit-tap-highlight-color:transparent] [&_.recharts-surface]:outline-none sm:mx-0"
      >
        <ResponsiveContainer>
          {/* Not focusable: the legend below is the keyboard-accessible control,
              and it carries the same numbers as real text. */}
          <PieChart tabIndex={-1}>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="56%"
              // Leaves room inside the box for the selected sector to reach out.
              outerRadius="93%"
              paddingAngle={1}
              stroke="var(--background)"
              strokeWidth={2}
              isAnimationActive={false}
              shape={renderSector}
              onClick={(_, index) => togglePinned(index)}
              onMouseEnter={(_, index) => setHovered(index)}
              onMouseLeave={() => setHovered(null)}
            >
              {data.map((slice) => (
                <Cell
                  key={slice.name}
                  fill={slice.color}
                  className="cursor-pointer outline-none"
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        {/* Reads out of the donut's hole, so nothing covers the chart. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5 px-[24%] text-center">
          <span className="text-sm font-semibold tabular-nums">
            {formatCurrency(active ? active.value : total, currency, locale)}
          </span>
          <span className="line-clamp-2 text-[11px] leading-tight text-muted-foreground">
            {/* Share first: a long category name would otherwise push the
                percentage out of the two-line clamp. */}
            {active ? `${percent(active.value)}% · ${active.name}` : "Total"}
          </span>
        </div>
      </div>

      <ul className="min-w-0 flex-1">
        {data.map((slice, index) => (
          <li key={slice.name} className="min-w-0">
            <button
              type="button"
              aria-pressed={pinned === index}
              onClick={() => togglePinned(index)}
              onMouseEnter={() => setHovered(index)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(index)}
              onBlur={() => setHovered(null)}
              className={cn(
                "flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                "hover:bg-accent focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-[3px]",
                activeIndex === index && "bg-accent",
              )}
            >
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: slice.color }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate">{slice.name}</span>
              <span className="shrink-0 whitespace-nowrap tabular-nums text-muted-foreground">
                {formatCurrency(slice.value, currency, locale)}
              </span>
              <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {percent(slice.value)}%
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
