# UI Rules

## Non-Negotiable Rule

Do not create custom UI primitives inside `app/**/page.tsx`.

Pages can compose UI, but base controls must come from `components/ui/*`.

## Allowed in Pages

- Layout composition
- Feature orchestration
- Importing and using domain components
- Importing and using existing `@/components/ui/*` primitives

## Not Allowed in Pages

- Defining new primitive button/card/dialog/input implementations inline
- Creating one-off style-only primitive components when a shared primitive should exist
- Duplicating existing base UI behavior with custom markup

## How to Add New UI Primitives

1. Create or extend primitive in `components/ui/`
2. Keep API reusable and generic
3. Reuse it from domain components and pages

## Design Tokens and Theming

- Use **semantic tokens**, never hardcoded Tailwind color literals. Reach for
  `bg-background`, `text-foreground`, `text-muted-foreground`, `border`, `bg-card`,
  `bg-primary`, `text-destructive`, and the project tokens `success` / `warning` /
  `brand` (solid or `/10` alpha for soft fills). Do NOT write `text-green-600`,
  `bg-indigo-600`, `bg-white`, etc.
- Everything must render correctly in **light and dark** (the app has a live
  `next-themes` toggle). Tokens get this for free; hardcoded colors do not.
- Dynamic per-category colors (hex from the DB) via `style={{}}` are the one
  allowed exception — they are user data, not tokens.

## Brand (logo)

The logo is an **"E" built from three ascending bars on a spine** — the initial
and a rising bar chart at once. It lives in `components/brand/logo.tsx` as three
exports; never re-draw it inline or substitute a lucide icon for it:

- `LogoGlyph` — the bare mark on a 24×24 viewBox, filled with `currentColor` and
  sized like a lucide icon. Use it when the mark sits on an existing surface.
- `LogoMark` — the glyph on a brand-coloured rounded tile (`bg-brand` /
  `text-brand-foreground`, so it is theme-aware for free). `size-8 rounded-lg` by
  default; override both together via `className` and the glyph scales with it,
  keeping the corner radius near the ~23% the app icons use.
- `Logo` — the full lockup, `LogoMark` plus the "Estalvify" wordmark and an
  optional `subtitle` line.

In use: the sidebar header (`app-sidebar.tsx`, which keeps its own wordmark so it
collapses correctly) and the login card.

### Icon assets are generated, not hand-edited

`scripts/generate-icons.mjs` holds the same four rects and emits every brand
asset from them — `app/icon.svg`, `app/apple-icon.png`, `app/favicon.ico`,
`public/logo.svg`, `public/logo-glyph.svg`, and the `public/icons/*` PWA set.
**Changing the mark means editing the geometry in both `logo.tsx` and that
script, then re-running `node scripts/generate-icons.mjs`** — do not touch the
generated files directly. The script needs `sharp` (present in the tree via
Next.js, not a declared devDependency); nothing at build or runtime uses it.

The manifest carries rounded `purpose: "any"` icons plus a separate full-bleed
`purpose: "maskable"` one, because a platform that masks the icon crops a rounded
tile badly. Brand indigo `#6366f1` is duplicated in `--brand` (`app/globals.css`),
`themeColor` (`app/layout.tsx`), `theme_color` (`public/manifest.json`) and the
generator — keep the four in sync.

## Charts

- Charts use **Recharts**, wrapped in reusable client components under
  `components/reports/` (e.g. `income-expenses-chart`, `category-breakdown-chart`) —
  never build a chart inline in a `page.tsx`.
- Wrap every chart in `ResponsiveContainer` (fixed-height parent) so it reflows.
- Color categorical series with the `--chart-1..5` tokens (`app/globals.css`), or the
  category's own hex when the series maps to a category. Axis/grid/tooltip use semantic
  tokens (`--muted-foreground`, `--border`, `--popover`) so charts read in light **and**
  dark. Format values with `lib/formatters` (`formatCurrency`).
- **Selecting a slice of the donut is legend-first** (`category-breakdown-chart`).
  A 1 % category is a sliver no finger can hit and a floating tooltip lands on
  top of the very chart you tapped, so: the legend rows are buttons (hover
  previews, click pins, click again releases), the selected sector reaches out
  while the others dim, and the reading happens in the donut's hole — no
  tooltip over the chart. When a text control already carries the same numbers,
  take the chart's `<svg>` out of the tab order (`tabIndex={-1}`) and suppress
  the two artifacts a tap leaves behind: `-webkit-tap-highlight-color` and the
  focus ring on `.recharts-surface`.

## A card must never outgrow its column

A grid whose only column count is a breakpoint variant — `grid gap-4
lg:grid-cols-2` — leaves the base layout with a single **implicit** `auto`
track. An `auto` track is sized by its items' *min-content* width, and a grid
item's default `min-width: auto` lets that min-content push the track wider
than the grid itself. One long legend row inside a card is then enough to make
the whole card hang off the right edge of a phone screen, while every sibling
outside the grid stays put. This is exactly how the Reports donut card ended up
overflowing on a 375 px viewport.

- **Always state the base column count**: `grid grid-cols-1 gap-4
  lg:grid-cols-2`. Tailwind's `grid-cols-N` expands to `minmax(0, 1fr)` tracks,
  which cannot exceed the container. It changes nothing visually when the
  content already fits.
- **Let text rows shrink.** A `flex` row whose label must truncate needs
  `min-w-0` on the row *and* on the flex ancestors between it and the card —
  `truncate` alone does nothing if an ancestor still reports a wide
  min-content.
- The route's `loading.tsx` mirrors the grid classes, so it gets `grid-cols-1`
  in the same change.

## Copy: terse, SaaS-style

- **No page subtitles.** `PageHeader` is used with a `title` (and optional `actions`)
  only — do not pass `description`. The screen's purpose is clear from its title and nav.
- Keep helper text, card descriptions and empty-state copy **short** — one plain phrase,
  not a sentence explaining the obvious. Prefer "For dates." over "The language used to
  render dates throughout the app." Trust the UI; don't narrate it.

## Use the Shared Controls (no one-off form controls)

- Selects: use `components/ui/simple-select` (flat options) or
  `components/categorize/category-select` (hierarchical categories). Never a raw
  `<select>` — Radix Select is theme-aware and consistent.
- Placeholder/empty states: use `components/ui/empty-state`.
- Modals: use `components/ui/dialog`. `DialogContent` is a **bottom sheet on
  mobile** (full width, pinned to the bottom, scrollable) and a centered
  dialog from `sm:` up, and it never autofocuses (no keyboard jump over the
  form). A consumer overriding the width MUST scope it (`sm:w-… sm:max-w-…`)
  so the mobile sheet stays full-width. Destructive actions confirm through
  the same dialog with a `destructive` button and a pending spinner.
- Page headers: use `components/layout/page-header` (title + actions; no subtitle).
- Money/dates: format via `lib/formatters`.

## Navigation Feedback (every route needs a `loading.tsx`)

Every page under `app/(app)` is a server component behind an authenticated,
dynamic layout, so a nav click has a visible gap before the new route paints.
Without feedback the app reads as frozen. **The skeleton IS the feedback** —
no spinners on nav icons, no top progress bar (both existed and were removed
by explicit product decision):

- **`loading.tsx` per route — required.** Every route under `app/(app)` that
  renders UI MUST ship a sibling `loading.tsx`. Next renders it the instant the
  link is clicked, and prefetches it, so the main area swaps to a skeleton
  immediately. This holds even for a page that awaits nothing (`insights`
  generates from the client): the segment is still fetched over the network.
  The only exception is a route that just `redirect()`s (`budget` → `plan`) —
  it renders no UI, and the destination has its own skeleton.
- **Same-route navigation (filters, month pickers).** A searchParams change
  does not re-render `loading.tsx`; wrap the data-dependent section in a
  `<Suspense key={param}>` with a skeleton fallback so the section swaps
  immediately while the shell stays interactive (Reports and Plan do this).

### Keeping a skeleton honest

A skeleton is part of the page's design, not a one-off. **Any change to a
page's layout MUST update that route's `loading.tsx` in the same change**, and
any new route MUST ship one from the start. A stale skeleton is worse than
none — it promises a layout that isn't coming and the page jumps when it
resolves.

In practice, when you touch a `page.tsx` or its top-level view component, ask:
did the header, the number of cards, the grid columns, or the row shape
change? If yes, the skeleton changes too.

- Build from `components/layout/skeletons` (`PageHeaderSkeleton`,
  `KpiGridSkeleton`, `ChartCardSkeleton`, `ListCardSkeleton`,
  `TableCardSkeleton`) rather than hand-rolling `Skeleton` blocks. If a page
  needs a shape that isn't there and another page could reuse it, add it to
  that module instead of inlining it.
- Mirror the real layout: same outer spacing (`space-y-4` vs `space-y-6`),
  same grid classes, same card count, same desktop/mobile split.
- Skeleton the *first* screen, not the empty state — assume data exists.
- Never draw a subtitle line: `PageHeader` has no subtitle.

## Sidebar Count Badges

A nav item can carry a count of outstanding work (transactions left to
categorize, recurring series left to review). Add one by putting the route in the
`pendingByUrl` map in `components/layout/app-sidebar.tsx` and passing the number
from the `(app)` layout — never by special-casing a URL in the render. The badge
is `variant="brand"`, hidden at zero, and caps at `99+`. Anything the layout
computes runs on **every** navigation, so a count that is not a cheap query
belongs behind a cache (see `ARCHITECTURE.md` → "Cached Reads").

## Desktop and Mobile: First-Class Views

This app is not desktop-only responsive.

Design for desktop and mobile as two first-class presentations:

- Desktop: higher information density, wider layouts, table-friendly patterns
- Mobile: simplified flows, card/list-first layouts, touch-friendly actions

Use one shared domain logic layer and separate view components when needed.

Recommended naming for feature UIs:

- `FeatureDesktopView`
- `FeatureMobileView`
- Shared pieces in `shared/`

When a desktop/mobile switcher is needed:

- Keep one orchestration component (`FeatureView` or feature container) for state/actions
- Render desktop and mobile views from that orchestrator
- Avoid hydration glitches and layout jumps during initial mount

For related transaction workflows (for example `transactions` and `categorize`):

- Keep shared visual language aligned: date headers, amount formatting, row/card rhythm
- Keep top-level structure aligned: title, filter area, summary/pagination
- Diverge only where behavior is intentionally different (read-only vs classify actions)

## Future Native Readiness

Even though native app work is not in scope now, UI decisions should keep migration simple:

- Keep business logic outside visual components
- Keep view models and transformations reusable
- Avoid tightly coupling UI behavior to desktop-only interaction assumptions
