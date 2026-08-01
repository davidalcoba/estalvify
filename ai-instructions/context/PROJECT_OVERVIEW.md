# Project Overview

## Product

Estalvify is a personal finance management app.

Users connect their bank accounts (via Enable Banking / PSD2) and the system regularly syncs transactions. Transactions are categorized through a combination of:

- Manual categorization
- Rule-based categorization

(An AI-assisted categorization flow is reserved for the future but is not implemented — the `CategorizationSource.AI` value exists as a placeholder only.)

The product also supports monthly spending budgets and reporting. Feature maturity is mixed: bank connect/sync, transactions, categorize, rules, and settings are stable; **dashboard, budget, and reports are still stubs** (placeholder UI, no real data yet).

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
