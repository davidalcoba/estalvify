import { formatCurrency } from "@/lib/formatters";
import type { CategorySpend } from "@/lib/analytics/trends";

// Presentational list of categories with a proportional bar. Server-safe (no
// interactivity). Used on the dashboard for "top spending categories".
export function CategoryBars({
  items,
  currency,
  locale,
}: {
  items: CategorySpend[];
  currency: string;
  locale: string;
}) {
  const max = Math.max(...items.map((i) => i.amount), 1);

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.categoryId} className="space-y-1">
          <div className="flex items-center gap-2 text-sm">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: item.color }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate">{item.name}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {formatCurrency(item.amount, currency, locale)}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full"
              style={{ width: `${(item.amount / max) * 100}%`, backgroundColor: item.color }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
