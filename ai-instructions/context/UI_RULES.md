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

## Progress rows: the bar IS the row

A list where every item is "how am I doing against a target" (Budget →
Objectives, both Income and Charges) does **not** stack a text line over a thin
progress bar — that reads as two objects per item and goes illegible on a phone
as soon as there are more than a handful. The row itself is the bar: a 44px
(`h-11`) full-width rounded block whose background is painted by progress, with
the name and the numbers sitting on top of it.

The pattern, as implemented in `components/budget/objectives-card.tsx`:

- **Solid tint (40%)** from the left = what has already happened (spent, or
  received for income).
- **Light tint (15%)** of the *same* colour continuing to where the current
  pace lands, plus a **1.5px line** at that point. No hatching, no second
  colour — projection is the same quantity, less certain.
- **No wall at the right edge for a non-`OK` state.** A 3px one was tried and
  removed: the fill is already painted in that state's colour, so it repeated
  in a hard edge what the whole bar was saying in amber or red, and read as a
  border on the row rather than as part of it. The colour is the state.
- **No mark for the committed slice.** A 3px rule along the bottom covering
  `fixedTotal / assigned` was tried and removed. The premise was wrong: an
  objective fed by recurring charges has no manual `extra`, so its budget
  *is* its recurring total and the rule came out full-width on every row that
  had one — distinguishing nothing, and reading as a black border on the row
  instead of as a marking inside the bar (worse on an expanded row, where it
  became a heavy divider above the panel). The committed amount is stated in
  the panel, as `Fixed`, which is where a number that does not vary within
  the month belongs.
- **No elapsed-month tick inside the row.** It was tried and removed: it sits
  at the same x in every row (it is the same month for all of them), so it
  reads as a per-category limit — the first question it got was "shouldn't
  that be different per category?". The projection line already carries the
  pace. State the elapsed % once in the card header, and again in the
  expanded panel. General rule: **a reference that is identical for every row
  does not belong inside the rows.**
- Colour comes from the control state (`--success` / `--warning` /
  `--destructive`), and is **grey while nothing has been spent** — `OK` on an
  untouched category is not news.
- **On the right, what is true now and what was planned**: `spent/budget`
  (`received/expected` for income), the budget half in
  `text-muted-foreground/50` — the same pair, in the same shape, as the
  dashboard's Categories card, so the two screens do not describe a category
  differently. A fully arrived income row keeps a `✓` rather than printing the
  same figure twice.
- **Nothing derived goes in the row.** Projected, its overshoot, fixed and
  pace are all computed *from* those two numbers, and they live in the panel
  the row expands into. A remaining-amount and an overshoot chip were both
  tried in the row and removed: five figures on one line stops being readable
  at a glance, which is the only thing the bar is for.

Zero targets must not paint `NaN`: clamp every percentage through a
finite-checked helper.

## No database words on screen

`rollover`, `accrual`, `variable budget`, `flows vs balance` are vocabulary of
the implementation. **No field name from the schema may reach the interface.**
If the user has to learn the data model to read a label, the label is not
finished. The Budget screen was rewritten for this: `Fund quotas (rollover)` →
`Set aside for later`, `Variable budget` → `To spend this month`, `Actual
result (accrual)` → `This month's balance`. When the method genuinely needs
explaining, it goes behind a tap, never into the label.

Two more rules came out of the same pass:

- **Decisions and observations do not share a card.** A block the user changes
  by editing (the plan) and a block that changes when a transaction lands (how
  the month is going) have opposite natures, and putting them under one title
  separated by a hairline made `Savings target −860` and `Actual savings
  +4 597` read as comparable figures. Two cards, two titles.
- **An indicator that is red by construction for part of the cycle is not an
  indicator, it is noise** — and it trains the user to ignore the warnings that
  do matter. Either compare against the right reference *to date*, or do not
  show the comparison until it means something. `Against plan so far` measures
  against the plan accrued to today for exactly this reason; against the whole
  month it was red from the 1st to the 26th, every month, because the charges
  land in the first week and the salaries on the 27th.
- **A warning is a figure and an action, not a paragraph.** The assignment gap
  first read `Lines 4598,00 € · gap −1,93 €` in grey under the total — the only
  thing on the screen that needed doing, and the least visible. Spelling it out
  as a full sentence fixed the visibility and cost three lines of card; two
  such notices pushed the objectives list below the fold. Both now use
  `components/budget/inline-notice.tsx`: **amount on the surface, action beside
  it, explanation behind the ⓘ.** The flows-vs-balance one also has a relative
  threshold (`discrepancyIsMaterial`: ≥ 25 € and ≥ 1 % of gross flow) so it
  stops firing on rounding.
- **Lead an "how is it going" block with something that can still be acted
  on.** Every backward-looking figure on the Budget result card is negative
  from the 1st to the 26th by construction — the charges land in the first week
  and the salaries on the 27th — so leading with them announces a disaster
  every month until it is too late to change anything. `Heading for` (real
  result plus the part of the plan not yet accrued) is positive, meaningful on
  day 8, and converges on the real result as the month closes. Corollary: the
  cash figures underneath carry **no colour at all**, since red on 26 days out
  of 31 is the habit that teaches people to stop reading red. One coloured
  number per card — the one that is a judgement rather than a fact.
- **A number the app knows is wrong must not look like one that isn't.**
  `Actual savings` is the balance change, so an active reconciliation warning is
  literally a statement that the figure is unreliable — the gap IS the
  difference between it and the month's balance shown two rows above. It was
  painted green at full weight next to that warning, i.e. the card contradicting
  itself. When the gap is material the figure drops to muted and carries an
  `unreliable` tag. Generally: if a check has failed, everything derived from
  the failing calculation degrades visually.
- **A line at zero is not information**, and `−0,00 €` is worse than none. The
  cascade hides its zero rows. The one exception is the savings target: it is
  the input of the whole cascade and has to stay reachable at zero.
- **State the pace in days, not per cent.** `23% elapsed` next to a list of
  objectives was read as "23 % of the objectives"; `Day 7 of 31` cannot be
  mistaken for progress against a goal.
- **A derived figure shows its arithmetic.** The Dashboard's week number is
  the daily rate times the days left of the ISO week, and printed alone it is
  a number the reader has to take on faith. Under it, `3 days × 129,25 € a
  day` — the same two operands the code used. The rule generalizes: where a
  headline figure comes from a calculation the user could not guess, the line
  beneath it is the calculation, not a second unrelated statistic.
- **Every number says what it is, and every period says of what.** `129,25
  €/día · quedan 2326,41 €` never states what remains; `16 ops · mediana 49.5`
  sits beside a euro amount and reads as money. Labels go with the figures,
  counters live next to the thing they count (the ops counter belongs to the
  week's *spending* block, not to the money left), and no `€` figure shares a
  line with a bare non-currency number.
- **Group by question, not by data source.** The week card answers two: "what
  can I still spend" and "what have I spent". Each is now its own block with
  its own heading, separated by a rule. Five figures under one heading is not
  a card, it is a dump.
- **Copy that claims to know something must actually know it.** The greeting
  was a constant `Good morning` and therefore wrong from 14:00 to 06:00 —
  visible above every other thing on the daily screen. Either derive it (the
  member's timezone is a stored preference; `lib/greeting.ts` is pure and
  unit-tested) or word it so it is true at any hour. The same test applies to
  anything phrased as an observation: a greeting, a "last updated", a
  "nothing new today".
- **A column heading is not the place to define a column.** Grid tracks sized
  `auto` take their width from the widest cell *including the heading*, so a
  self-explaining heading (`Mes / presupuesto` over `555 € / 550 €`) is paid
  for out of the column that had to truncate anyway — the category name.
  Define the columns once in the card description, in the order they appear,
  and keep the headings to the one word that identifies each.

## One title on screen at a time

A screen names itself twice — as the page's `<h2>` (`PageHeader`) and in the
sticky header — and at the top of a page that is a plain duplicate, on desktop
as much as on a phone. It stops being one as soon as the page scrolls: the
`<h2>` leaves and the header's copy becomes the only thing saying where you
are, which matters most on a phone, where the sidebar is closed.

So **the header's title is deferred, not deleted**: hidden while the page's own
title is on screen, faded in as that one goes under the header — the iOS
large-title handover. `PageHeader` reports its heading's visibility through
`components/layout/page-title-context.tsx`; `AppHeader` reads it. Same
behaviour at every width; the sticky header is not a mobile-only element.

- **Do not add a second title to a page**, and do not restore an always-on one
  in the header — pick the `PageHeader` title and let the shell do the rest.
- The header's copy is **kept mounted and faded**, never unmounted: the row
  must not reflow, and the swap is meant to go unnoticed. It carries
  `aria-hidden` while invisible, so a screen reader is never read both.
- The heading is measured against the header's **actual** height, which grows
  by the status-bar inset once installed (`h-header-safe`) — hence the
  `[data-app-header]` hook rather than a hardcoded 56px.
- Nothing resets the state per route: the outgoing `PageHeader` hands the title
  back as it unmounts, and the state starts "page title visible" so the header
  never flashes its own for a frame on a navigation.
- A route with no `PageHeader` has nothing to report, so the header keeps its
  title — which is the right fallback, not a bug to fix elsewhere.

## The sign-in screen states the product, and only true things

`/login` is the one screen a stranger sees, so it is laid out as a front door
rather than a lone dialog: on a wide screen the product says what it is on the
left and the sign-in card sits on the right; on a phone the same material
stacks in reading order — name, promise, card, proof — placed with explicit
grid rows so no markup is rendered twice. The `(auth)` layout centers whatever
the page gives it and owns the page padding, so sibling screens (`/welcome`,
`/invite`, the MCP consent) stay a single narrow card without changes.

- **Every claim is about something that ships.** The three points in
  `components/auth/product-points.tsx` are written from
  `PROJECT_OVERVIEW.md` — read-only PSD2 sync through Enable Banking, the
  user's own categorization rules, the 60-day balance forecast. No
  certifications we do not hold, no user counts, no "bank-grade" adjectives,
  nothing "coming soon". **A feature that is removed or changed must change
  this screen in the same commit.**
- **Name the limitation instead of hiding it.** One button and no password
  field reads as a broken form until you know why, so the card says Google is
  the only way in, and says where the password goes.
- **The Google mark keeps its own colours** (`components/brand/google-icon.tsx`)
  — the documented exception to the no-hardcoded-colour rule, since it is a
  trademark reproduced to someone else's guidelines. Do not tint it, and do not
  substitute a lucide icon.

## Copy: terse, SaaS-style

- **No page subtitles.** `PageHeader` is used with a `title` (and optional `actions`)
  only — do not pass `description`. The screen's purpose is clear from its title and nav.
- Keep helper text, card descriptions and empty-state copy **short** — one plain phrase,
  not a sentence explaining the obvious. Prefer "For dates." over "The language used to
  render dates throughout the app." Trust the UI; don't narrate it.

## Every visible string comes from the dictionaries

The interface is translated into **English, Castellano and Català**
(`lib/i18n/`, see ARCHITECTURE.md → "Internationalization"). So a literal is a
bug, not a shortcut:

- No hardcoded user-facing text. That includes button labels, headings, empty
  states, placeholders, `aria-label`, `title`, chart series names and
  `sr-only` text — anything a person or a screen reader reads.
- Server components and actions: `const t = await getT()`.
  Client components: `const t = useT()`.
- A page's `<title>` moves from `export const metadata` to
  `export async function generateMetadata()`.
- **Keep whole sentences in the dictionary.** A sentence spliced out of JSX
  (`"You agree to our " + <Link/> + " and " + <Link/>`) cannot be translated:
  word order moves. Put the markers in the message and render it with
  `<RichText template={t("…")} slots={{ terms: <Link/> }} />`.
- Counts use `t.plural("base", n)`, which reads `base.one` / `base.other` and
  supplies `{count}`.
- Module-level tables (nav items, status badges, field labels) hold **message
  keys** typed as `MessageKey`, not labels — the array is constant, the
  language is not.

Adding a string means adding it to **all three** dictionaries in the same
change; `Record<MessageKey, string>` makes a missing one a typecheck failure.

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
  `BarListCardSkeleton`, `TableCardSkeleton`) rather than hand-rolling
  `Skeleton` blocks. If a page
  needs a shape that isn't there and another page could reuse it, add it to
  that module instead of inlining it.
- Mirror the real layout: same outer spacing (`space-y-4` vs `space-y-6`),
  same grid classes, same card count, same desktop/mobile split.
- Skeleton the *first* screen, not the empty state — assume data exists.
- When a page ALSO streams its body behind a `<Suspense>` boundary, the
  boundary's fallback and the route's `loading.tsx` are the same skeleton and
  must stay identical — so export one component and have both use it, rather
  than writing the shape twice. Dashboard keeps its body grid and skeleton
  together in `components/budget/dashboard-skeleton.tsx`; Budget's live in
  `components/budget/month-shell.tsx`.
- Never draw a subtitle line: `PageHeader` has no subtitle.

## Sidebar Count Badges

A nav item can carry a count of outstanding work (transactions left to
categorize, recurring series left to review). Add one by putting the route in the
`pendingByUrl` map in `components/layout/app-sidebar.tsx` and passing the number
from the `(app)` layout — never by special-casing a URL in the render. The badge
is `variant="brand"`, hidden at zero, and caps at `99+`. Anything the layout
computes runs on **every** navigation, so a count that is not a cheap query
belongs behind a cache (see `ARCHITECTURE.md` → "Cached Reads").

## Role-Aware Affordances (household roles)

A household member can be a read-only VIEWER (PLAN_MULTIUSER.md §5). Every
**mutation affordance** — a button, inline editor, dialog trigger or row click
that ends in a server action or write API call — must not render for a member
whose role can't use it. Client components get the role from
`useCanWrite()` / `useHouseholdRole()` (`components/layout/role-provider.tsx`,
mounted in the `(app)` layout); server components read `scope.role` from
`requireScope`. Pages that are pure work queues (`/categorize`, `/rules`)
render a read-only `EmptyState` for VIEWER instead of dead controls, and their
sidebar items are filtered out (`WRITE_ONLY_URLS` in `app-sidebar.tsx`).
This is presentation only: the server action/route still enforces its own
level — hiding a button is never the access control.

## Desktop and Mobile: First-Class Views

This app is not desktop-only responsive.

Design for desktop and mobile as two first-class presentations:

- Desktop: higher information density, wider layouts, table-friendly patterns
- Mobile: simplified flows, card/list-first layouts, touch-friendly actions

A screen is not finished when it merely *survives* a wide viewport. A
`mx-auto max-w-*` column reads as centred and deliberate on the phone it was
designed for and as an unfinished mobile port on a desktop, which is exactly
how the Dashboard shipped: one 576px column of cards with empty gutters either
side while every other screen used the full width. Unless the content has a
genuine reading-width limit (prose, a settings form — `settings` keeps its
`max-w-lg`), a multi-card screen lays out as `grid grid-cols-1 gap-4
lg:grid-cols-2` like Budget and Reports, and lets the cards use the width.

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

### No popovers inside the mobile sidebar

The mobile sidebar is a sheet that drops in from the top, and it is already a
dismissable layer. Hanging a second one off it — a dropdown menu anchored to a
row inside it — is the wrong shape on a phone: the items shrink to desktop hit
targets, the two layers dismiss independently, and a link inside the popover
navigates while leaving the sheet open behind the new page (exactly how
Settings behaved from the user menu).

So the footer user menu is two first-class presentations, not one component
made responsive (`app-sidebar.tsx` → `UserMenuDesktop` / `UserMenuMobile`,
sharing `UserIdentity`):

- **Desktop** keeps the `DropdownMenu`, opening to the `right` of the rail.
- **Mobile** expands the same actions *inline* in the sheet, as `lg`
  `SidebarMenuButton` rows below the user row, with a chevron that points the
  way the panel grows. Every action that navigates or switches household calls
  `setOpenMobile(false)` so the sheet retracts with the transition.

**Inline only works if the sheet does not scroll as one column.** With
`overflow-y-auto` on the panel, expanding the footer of an already-full sidebar
opened the rows *below the fold* — you had to scroll to reach what you had just
tapped open, which is barely better than the popover it replaced. The mobile
`SheetContent` is therefore capped (`max-h-[85svh]`) and left as a flex column
with no overflow of its own: `SidebarContent` takes the leftover space and
scrolls internally, so the header and the footer stay in view at every height
and the nav gives up room to whatever the footer reveals. Anything else that
grows inside that footer follows the same rule — cap it and let it scroll
(`#user-menu-actions` is `max-h-[50svh] overflow-y-auto`), never let it push the
last row past the bottom edge.

One desktop detail worth keeping: Radix returns focus to the trigger when a
menu closes, and a script-driven `focus()` right after a *click* still matches
`:focus-visible` in Chrome — which left the avatar row ringed and reading as
selected long after the menu was gone. `onCloseAutoFocus` is prevented unless
the menu was actually driven from the keyboard, where returning focus is the
whole point.

## Installed App (standalone mode)

The app is an installable PWA, so on a phone it also runs with no browser chrome
at all. Two rules follow:

- **Respect the safe areas.** The root layout sets `viewport-fit=cover`, so the
  page paints under the status bar, the notch and the home indicator. Anything
  anchored to a screen edge uses the utilities in `app/globals.css` — `pt-safe`
  and `h-header-safe` for top-anchored chrome (the header is `sticky top-0`, so
  this is required, not cosmetic), `pb-safe-4` for bottom-anchored content. They
  are additive where the element already has padding, and collapse to normal
  spacing in a browser tab.
- **Never assume a browser UI.** In standalone there is no address bar, no back
  button and no reload. Every screen needs its own in-app way back.

Do not re-pin `maximumScale` in the viewport: it disables pinch-zoom and is an
accessibility regression.

### Pull to refresh

Reload on a phone is the gesture, not a button: drag down from the top of any
`(app)` screen and the page reloads. It is the answer to "there is no reload in
standalone" for the data itself — the shell already carries the way back.

It is mounted once, for every route at once: `PullToRefresh`
(`components/layout/pull-to-refresh.tsx`) **renders the `<main>` element** of
the app shell, and `hooks/use-pull-to-refresh.ts` runs the gesture.
**Do not add a per-page refresh control, and do not mount a second one** — a
screen that needs to reload after its own action calls `router.refresh()` as
it already does.

What the pattern commits to, so a future change does not undo it by halves:

- **The refresh is `router.refresh()` in a transition.** Every screen is a
  server component, so re-running the route on the server *is* the reload:
  data comes back fresh while the month picker, the filters and the scroll
  position survive, and `isPending` is what the spinner waits on — never a
  fixed timer, and never `location.reload()` (which would drop all of that and
  re-download the app).
- **Touch only.** Gated on `(pointer: coarse)`; a desktop browser keeps its
  own reload and its own overscroll untouched.
- **We take the browser's gesture, we do not sit next to it.** While the hook
  is mounted the body gets `overscroll-behavior-y: contain` and the pull
  `preventDefault`s, so Chrome's native pull-to-refresh and the iOS
  rubber-band do not run alongside ours. Both restored on unmount, so
  `/login`, `/offline` and the legal pages keep theirs.
- **The page moves, not just a badge.** `<main>` slides down and the indicator
  comes out from behind the sticky header, which is what makes it read as the
  page being pulled. The transform is applied *only* while the sheet is off
  its rest position — a permanent one would make `<main>` a containing block
  for every fixed-position descendant.
- **It yields to whatever else owns the finger.** It does not start when a
  dialog or the mobile sidebar is open (`data-scroll-locked` on the body),
  when the page is scrolled, or inside a region that is itself scrolled; a
  sideways or upward start is left to the page.
- The travel curve, the arming threshold and the resistance live in
  `lib/ui/pull-to-refresh.ts` and are unit-tested. **Tune the feel there**, not
  with magic numbers in the component.

## Future Native Readiness

Even though native app work is not in scope now, UI decisions should keep migration simple:

- Keep business logic outside visual components
- Keep view models and transformations reusable
- Avoid tightly coupling UI behavior to desktop-only interaction assumptions
