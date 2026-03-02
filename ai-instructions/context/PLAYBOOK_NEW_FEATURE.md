# Playbook: New Feature

## Goal

Deliver feature changes that are safe for financial workflows, consistent with architecture, and usable on both desktop and mobile.

## Step-by-Step Checklist

1. Read context
- Read `ai-instructions/README.md` and linked docs before coding.

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

6. Respect multi-user boundaries
- Enforce authenticated user scoping on all user-owned data.

7. Handle async workflows correctly
- Use queue-based processing for long-running operations.
- Surface progress/status clearly in UI.

8. Validate and ship
- Run lint and relevant checks
- Validate key flows manually
- Summarize what is implemented vs pending

## Delivery Notes Template

When finishing a feature, include:

- What changed
- Why this approach was chosen
- Desktop behavior
- Mobile behavior
- Multi-user safety checks applied
- Known gaps or TODOs
