# Project Overview

## Product

Estalvify is a personal finance management app.

Users connect their bank accounts (via Enable Banking / PSD2) and the system regularly syncs transactions. Transactions are categorized through a combination of:

- Manual categorization
- Rule-based categorization

(An AI-assisted categorization flow is reserved for the future but is not implemented — the `CategorizationSource.AI` value exists as a placeholder only.)

The product also supports manual cash-flow planning and reporting. Bank connect/sync, transactions, categorize, rules, plan, recurring detection, notifications, dashboard, reports, forecast, and settings are all functional with real data.

The three forward-looking features form one mental model: **Plan** (what you expect to earn and spend) → **Forecast** (where that leaves your balance) → **Recurring** (auto-detected charges you can add to your Plan). Plan is the single place you declare intent; the Forecast projects from it; Recurring detection is a helper that suggests entries.

Dashboard & reports: the dashboard shows real KPIs (net worth from latest balances, income/expenses this month, transactions to categorize) plus a 6-month income-vs-expenses chart and top categories; reports show a 12-month trend, a spending-by-category donut, and top merchants. Trend/aggregation logic is in `lib/analytics/` (`spending.ts`, `trends.ts`); charts are theme-aware Recharts components in `components/reports/` using the `--chart-*` tokens.

Plan (manual cash-flow planning): users declare the income and expenses they expect by hand, as standing `PlanItem`s (model in `prisma/schema.prisma`). Unlike the old month-by-month budget, a category can hold several items (e.g. rent monthly + car tax yearly) and each item has a cadence (`PlanCadence`: weekly / monthly / quarterly / yearly / one-off, with an optional day-of-month or a specific date). A category's steady monthly total is its **limit**, tracked against real spending with the same `ok/warning/over` progress model. The monthly income − expenses net is the savings goal. See `app/(app)/plan/`, `lib/plan/` (`plan-item.ts` pure logic + `plan-dto.ts`), and `components/plan/`. The pure `budget-progress`/`budget-dto` helpers in `lib/budget/` are reused for the limit bars. The old `/budget` route redirects to `/plan`; a migration carries each user's most recent monthly budget forward as monthly plan items.

Recurring payments / subscriptions: candidates are detected on the fly from the last ~13 months of transactions (grouped by a normalized merchant key, classified into weekly/monthly/quarterly/yearly cadences); the user confirms or ignores each, and decisions are stored in the `RecurringSeries` model (with a snapshot of cadence/amount for future forecasting and alerts). A confirmed series has an **"Add to Plan"** action that creates a matching `PlanItem`, so detection feeds the Plan without retyping. See `app/(app)/recurring/`, `lib/recurring/` (pure detector + DTO), and `components/recurring/`.

In-app notifications: a header bell surfaces alerts generated from the user's data — over/near a category's planned limit (from the Plan), upcoming confirmed recurring charges, and a projected low-balance alert (from the plan-driven forecast). Generation is idempotent (upsert by `(userId, dedupeKey)` on the `Notification` model) and runs in the daily cron (`app/api/cron/sync`) plus an on-demand "Check now" action. Pure generators live in `lib/notifications/generators.ts` (with the impure gather/upsert in `generate.ts`); UI in `components/notifications/`. Push/email are future channels.

Forecast: the `/forecast` page projects the balance from the user's **Plan** — each future month's net comes from the planned income/expenses (`plannedForMonth`, with one-offs landing in their month), accumulated onto current net worth via `projectBalancesVariable`. When there is no Plan yet it falls back to the historical average net (last 6 full months) so the page still works day one. It also shows projected spend this month (linear extrapolation of actuals), average monthly net, and upcoming dated charges from the Plan (one-offs and monthly items with a day-of-month). Pure logic in `lib/analytics/forecast.ts` and `lib/plan/plan-item.ts`; the projected-balance area chart is `components/reports/balance-forecast-chart.tsx`. When the projection dips below zero it also emits the `LOW_BALANCE_PROJECTED` notification (`lib/notifications/generate.ts`, plan-driven, average fallback).

AI insights: the `/insights` page generates on-demand recommendations from an **anonymized** financial summary (aggregate amounts + category names only — never IBANs, raw descriptions, or merchant names). A provider-agnostic wrapper in `lib/ai/` (interface + factory selected by `AI_PROVIDER`, default a Claude provider using `@anthropic-ai/sdk`) keeps the model swappable and the API key server-side. Pure summary-building (`lib/ai/summary.ts`) and zod response parsing (`lib/ai/parse.ts`) are unit-tested. If no API key is configured, the page shows a clear "not configured" state instead of failing.

## Core Goals

- Give users a clear picture of their money across accounts
- Reduce manual work in transaction categorization
- Help users track monthly spending and trends

## Core Principles

- Security and privacy first for financial data
- Reliable bank sync behavior
- Clear and predictable UX on desktop and mobile
- Incremental delivery: partial features are acceptable when clearly marked

## Platform and Stack

- Next.js 16 (App Router) + React 19, TypeScript (strict)
- Prisma 7 with the Neon serverless Postgres adapter
- Auth.js v5 (`next-auth` beta) with Google OAuth and database sessions
- Tailwind CSS v4 + shadcn/ui (Radix), theme-aware light/dark via `next-themes`
- Recharts for charts (dashboard/reports), wrapped in `components/reports/` and colored via the `--chart-*` tokens
- `@anthropic-ai/sdk` for AI insights, behind a provider-agnostic wrapper in `lib/ai/` (default provider Claude; `AI_PROVIDER` / `ANTHROPIC_API_KEY` / `AI_MODEL`)
- Enable Banking (PSD2 open banking) for bank connections and sync
- Async job processing with `@vercel/queue` + a daily Vercel cron
- Vercel for deployment and platform services

## Quality Gates

- Unit tests with Vitest (`lib/**/*.test.ts`); run `npm run test`.
- CI (`.github/workflows/ci.yml`) runs typecheck + lint + tests on every PR.
- Before finishing work: `npm run typecheck && npm run lint && npm run test`.

## Deployment and Platform Policy

- The app is deployed on Vercel.
- For new features, prefer Vercel built-in capabilities whenever they are a good fit and there is no stronger alternative.
- Examples include deployment/runtime features, scheduling, queues, edge/middleware capabilities, and observability integrations.

## Multi-User Model

This is a multi-user SaaS-style app.

Each user has an isolated workspace and data scope. User data must never cross boundaries.

Examples of user-scoped entities:

- Bank connections
- Bank accounts
- Transactions
- Categorization rules
- Budgets and reports
- User preferences

All read/write operations must be explicitly scoped to the authenticated user.
