// The daily screen's body layout and its placeholder, in one place because
// three files must agree on it: the page, its Suspense fallback and the
// route's loading.tsx. Keeping the grid classes in a constant is what stops
// the skeleton drifting from the real layout the next time the breakpoints
// change (UI_RULES → "A card must never outgrow its column").

import { ListCardSkeleton } from "@/components/layout/skeletons";

/**
 * The two cards sit side by side from `lg` up and stack below it — the grid
 * the rest of the app already uses (Budget, Reports). The base `grid-cols-1`
 * is deliberate: a breakpoint-only column count leaves an implicit `auto`
 * track that a long row inside a card can push past the viewport.
 * `items-start` keeps the shorter card from stretching to its neighbour.
 */
export const DASHBOARD_BODY_GRID =
  "grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start";

/** Available this week (number + composition) next to the category list. */
export function DashboardBodySkeleton() {
  return (
    <div className={DASHBOARD_BODY_GRID}>
      <ListCardSkeleton rows={4} titleWidth="w-40" />
      <ListCardSkeleton rows={8} titleWidth="w-28" />
    </div>
  );
}
