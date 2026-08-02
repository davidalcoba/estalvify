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

## Charts

- Charts use **Recharts**, wrapped in reusable client components under
  `components/reports/` (e.g. `income-expenses-chart`, `category-breakdown-chart`) —
  never build a chart inline in a `page.tsx`.
- Wrap every chart in `ResponsiveContainer` (fixed-height parent) so it reflows.
- Color categorical series with the `--chart-1..5` tokens (`app/globals.css`), or the
  category's own hex when the series maps to a category. Axis/grid/tooltip use semantic
  tokens (`--muted-foreground`, `--border`, `--popover`) so charts read in light **and**
  dark. Format values with `lib/formatters` (`formatCurrency`).

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
- Page headers: use `components/layout/page-header` (title + actions; no subtitle).
- Money/dates: format via `lib/formatters`.

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
