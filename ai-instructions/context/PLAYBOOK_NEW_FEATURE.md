# Playbook: New Feature

## Goal

Deliver feature changes that are safe for financial workflows, consistent with architecture, and usable on both desktop and mobile.

## Step-by-Step Checklist

1. Read context
- Read `ai-instructions/context/README.md` and linked docs before coding.

2. Define scope
- Confirm if feature is net-new, extension, or refactor.
- Mark unknowns explicitly instead of guessing.

3. Place code in the right layer
- Domain logic in `lib/`
- Mutations in `actions.ts` or API routes
- UI primitives in `components/ui/`
- Domain UI in `components/<domain>/`

4. Apply platform preference (Vercel-first)
- Prefer Vercel built-in capabilities when they fit the requirement.
- Only add non-Vercel infrastructure when there is a clear gap or stronger alternative.
- Document tradeoffs when choosing a non-Vercel path.

5. Design both desktop and mobile
- Do not treat mobile as a compressed desktop only.
- If needed, provide `DesktopView` and `MobileView` components with shared domain logic.

6. Keep the route skeleton in sync
- A new route under `app/(app)` ships a sibling `loading.tsx` from the start.
- Changing an existing page's layout means updating that route's `loading.tsx`
  in the same change — a skeleton that no longer matches causes a layout jump.
- Build from `components/layout/skeletons`. See `UI_RULES.md` →
  "Navigation Feedback".

7. Respect multi-user boundaries
- Enforce authenticated user scoping on all user-owned data.

8. Handle async workflows correctly
- Use queue-based processing for long-running operations.
- Surface progress/status clearly in UI.

9. Update the docs (same change)
- If the change touches architecture, stack, UI conventions, or feature status,
  update the relevant file in `ai-instructions/context/` in the same PR.
- Add/adjust env vars in `.env.example` when introducing new configuration.

10. Validate and ship
- Run `npm run typecheck && npm run lint && npm run test`
- Add Vitest tests for any new pure logic
- Validate key flows manually
- Summarize what is implemented vs pending
- Branch off `preview` and open the PR **against `preview`**, never against
  `main` — CI rejects any PR into `main` that does not come from `preview`.
  See `CLAUDE.md` → "Branching model".
- After pushing the branch / opening the PR, report the Vercel preview URL
  (see `CLAUDE.md` → "Deployment & preview URLs").

11. Promote to production
- Merging into `preview` redeploys the fixed integration URL
  `https://estalvify-preview.vercel.app`. Verify the feature there.
- When the batch is ready, open a `preview` → `main` PR; merging it deploys to
  production.

## Delivery Notes Template

When finishing a feature, include:

- What changed
- Why this approach was chosen
- Desktop behavior
- Mobile behavior
- Multi-user safety checks applied
- Known gaps or TODOs
