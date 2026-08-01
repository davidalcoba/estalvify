# Project Overview

## Product

Estalvify is a personal finance management app.

Users connect their bank accounts (via Enable Banking / PSD2) and the system regularly syncs transactions. Transactions are categorized through a combination of:

- Manual categorization
- Rule-based categorization

(An AI-assisted categorization flow is reserved for the future but is not implemented — the `CategorizationSource.AI` value exists as a placeholder only.)

The product also supports monthly spending budgets and reporting. Bank connect/sync, transactions, categorize, rules, budgets, recurring detection, notifications, dashboard, reports, and settings are all functional with real data.

Dashboard & reports: the dashboard shows real KPIs (net worth from latest balances, income/expenses this month, transactions to categorize) plus a 6-month income-vs-expenses chart and top categories; reports show a 12-month trend, a spending-by-category donut, and top merchants. Trend/aggregation logic is in `lib/analytics/` (`spending.ts`, `trends.ts`); charts are theme-aware Recharts components in `components/reports/` using the `--chart-*` tokens.

Budgets: users set a planned amount per category for a month and track it against real spending (derived from approved-category DEBIT transactions). See `app/(app)/budget/`, `lib/budget/` (progress + DTO), `lib/analytics/spending.ts` (monthly spending aggregation), and `components/budget/`.

Recurring payments / subscriptions: candidates are detected on the fly from the last ~13 months of transactions (grouped by a normalized merchant key, classified into weekly/monthly/quarterly/yearly cadences); the user confirms or ignores each, and decisions are stored in the `RecurringSeries` model (with a snapshot of cadence/amount for future forecasting and alerts). See `app/(app)/recurring/`, `lib/recurring/` (pure detector + DTO), and `components/recurring/`.

In-app notifications: a header bell surfaces alerts generated from the user's data — over/near budget (from Phase 1) and upcoming confirmed recurring charges (from Phase 2). Generation is idempotent (upsert by `(userId, dedupeKey)` on the `Notification` model) and runs in the daily cron (`app/api/cron/sync`) plus an on-demand "Check now" action. Pure generators live in `lib/notifications/generators.ts` (with the impure gather/upsert in `generate.ts`); UI in `components/notifications/`. Push/email are future channels.

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
