---
name: frontend-design
description: Build and refine UI for the Estalvify finance app so it stays consistent with the existing design system. Use when creating or changing pages, components, or primitives — anything touching the app's visual layer. Enforces reuse of shared shadcn/ui primitives, semantic design tokens, theme-awareness, and first-class desktop/mobile views.
---

# Frontend design (Estalvify)

This is a **consistency-first** design skill, not a "make it distinctive" skill.
Estalvify is a personal-finance app where users manage real bank data: the UI
must be calm, legible, and predictable across every screen. Prefer coherence
with what already exists over novelty. New work should look like it was always
part of the app.

Read `ai-instructions/context/UI_RULES.md` first — it is the source of truth and
this skill operates inside it.

## The design system (use it, don't reinvent it)

- **Primitives:** shadcn/ui ("new-york") in `components/ui/*`, built on the
  unified `radix-ui` package. Compose these; do not hand-roll buttons, inputs,
  dialogs, selects, cards, etc. If a primitive is missing, add it to
  `components/ui/` with a reusable API — never inline a one-off in a page
  (UI_RULES non-negotiable).
- **Styling:** Tailwind CSS **v4** (CSS-first, tokens in `app/globals.css`).
  Icons from `lucide-react`. Class merging via `cn()` (`clsx` + `tailwind-merge`).
- **Domain UI:** lives in `components/<domain>/`; pages orchestrate, they don't
  define primitives.

## Rules that keep the UI coherent

- **Use semantic tokens, never hardcoded colors.** Reach for `bg-background`,
  `text-foreground`, `text-muted-foreground`, `border`, `bg-card`,
  `bg-primary`/`text-primary-foreground`, `text-destructive`, etc. Do **not**
  write `text-green-600`, `bg-purple-100`, `bg-indigo-600` and similar literal
  Tailwind colors — they break theme consistency and dark mode. For semantic
  finance states (income vs expense) prefer existing tokens or add a named token
  rather than a raw color.
- **Be theme-aware.** The app ships a class-based `.dark` theme (OKLCH) toggled
  via `next-themes`. Anything you build must look correct in both light and
  dark. Because tokens already have dark values, using tokens gets this for
  free; hardcoded colors do not.
- **Reuse the shared visual language.** Amount formatting, date headers, row/card
  rhythm, and title/subtitle/filter/summary structure should match sibling
  features (especially `transactions` and `categorize`). Diverge only where the
  behavior genuinely differs (read-only vs classify).
- **Accessibility is not optional.** Keep Radix semantics (labels, `DialogTitle`,
  `sr-only` where needed), visible focus states, adequate contrast, and
  touch-friendly targets on mobile. Do not disable zoom.

## Desktop and mobile are both first-class

Not desktop-only responsive. For a feature with meaningfully different layouts,
follow the established pattern: one orchestrator holds state/actions and renders
`FeatureDesktopView` / `FeatureMobileView`, with shared pieces in `shared/`
(see `components/transactions/`, `components/categorize/`). Keep business logic
out of the view components so it stays reusable (and native-migration friendly).

## Polish, within the system

Quality here means restraint and precision, not spectacle: consistent spacing
and typography scale, careful empty/loading/error states, meaningful but subtle
motion, and pixel-level alignment with neighbouring screens. Match implementation
complexity to the need — most finance UI is refined and quiet, not maximalist.

## When building anything

1. Look for an existing primitive or domain component to reuse or extend.
2. Compose with tokens; check it in light **and** dark.
3. If it's a feature UI, decide whether desktop/mobile need distinct views.
4. Keep it consistent with `transactions`/`categorize` conventions.
5. Run `npm run lint` and `npm run typecheck` before finishing.
