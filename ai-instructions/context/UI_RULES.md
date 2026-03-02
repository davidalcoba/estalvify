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
- Keep top-level structure aligned: title/subtitle, filter area, summary/pagination
- Diverge only where behavior is intentionally different (read-only vs classify actions)

## Future Native Readiness

Even though native app work is not in scope now, UI decisions should keep migration simple:

- Keep business logic outside visual components
- Keep view models and transformations reusable
- Avoid tightly coupling UI behavior to desktop-only interaction assumptions
