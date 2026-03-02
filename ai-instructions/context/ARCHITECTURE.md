# Architecture

## High-Level Structure

- `app/`: routes, layouts, pages, API routes, and server actions
- `components/`: reusable UI and domain components
- `components/ui/`: base UI primitives (shadcn-based)
- `lib/`: business and integration logic
- `prisma/`: schema and migrations
- `scripts/`: operational scripts

## Deployment Context

- Primary deployment platform: Vercel.
- Architecture decisions should assume Vercel hosting/runtime constraints and capabilities by default.
- When multiple implementation options exist, prefer Vercel-native features unless there is a clear technical reason not to.

## Route Groups

- `app/(auth)/`: authentication routes and auth layout
- `app/(app)/`: authenticated application routes and app shell

## Layer Responsibilities

- `app/**/page.tsx`
  - Compose feature sections
  - Fetch/orchestrate data
  - Delegate interactions to components and actions

- `components/ui/*`
  - Base visual primitives used across the app
  - Single source for buttons, cards, dialogs, inputs, badges, etc.

- `components/<domain>/*`
  - Domain-aware UI components (accounts, settings, transactions, categorize)

- `lib/*`
  - Non-visual domain logic
  - Integration logic (banking sync, categorization internals, queue helpers)

- `app/**/actions.ts`
  - Server actions for mutations

- `app/api/**/route.ts`
  - API handlers and webhook/sync endpoints

## Multi-User Data Isolation

All data access must be filtered by current user context.

Rules:

- Never query shared data without `userId` constraints when entity is user-owned
- Never accept a client-provided `userId` as source of truth
- Always derive user context from authenticated session

## Async Processing

Queue-based async processing is used for non-blocking workflows (for example sync jobs).

Rules:

- Keep UI responsive while jobs run in background
- Reflect processing state to users
- Ensure retries are safe and idempotent where possible
