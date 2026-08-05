# Project Overview

## Product

Estalvify is a personal finance management app.

Users connect their bank accounts (via Enable Banking / PSD2) and the system regularly syncs transactions. Transactions are categorized through a combination of:

- Manual categorization
- Rule-based categorization

(An AI-assisted categorization flow is reserved for the future but is not implemented — the `CategorizationSource.AI` value exists as a placeholder only.)

The product also supports manual cash-flow planning and reporting. Bank connect/sync, transactions, categorize, rules, plan, recurring detection, notifications, dashboard, reports, forecast, and settings are all functional with real data.

The three forward-looking features form one mental model: **Plan** (what you expect to earn and spend) → **Forecast** (where that leaves your balance) → **Recurring** (auto-detected charges that enter the Plan when you confirm them). Plan is the single place intent lives; the Forecast projects from it; Recurring detection is the helper that fills it in.

Dashboard & reports: the dashboard leads with **Available to spend** — the month's variable budget (from the savings-first commitments, `lib/plan/month-status.ts`) minus variable spend (each category's spend capped at its Plan limit counts as fixed via `splitVariableSpend` — the same limits behind the category bars and budget alerts, so committed charges never double-count), with pace vs the point of the month and a per-day figure — plus real KPIs (net worth from latest balances, income this month with an income-concentration note when two holders earn, transactions to categorize) plus a 6-month income-vs-expenses chart and top categories; reports show an income-vs-expenses trend, a spending-by-category donut, and top merchants, all driven by a filter bar (reference month, 6/12/24-month trend window, single bank account) whose state lives in the URL — `?month=YYYY-MM&trend=12&accountId=…` — so a filtered view is shareable and the cards re-suspend on their own while the filters stay usable. Trend/aggregation logic is in `lib/analytics/` (`spending.ts`, `trends.ts`, `report-filters.ts`); charts are theme-aware Recharts components in `components/reports/` using the `--chart-*` tokens.

Budget (/plan): the cascade view (expected result as the goal) plus the composed category objectives. The old `/budget` route redirects here. PlanItem and the old Plan UI were superseded by recurring series + planned items (see the planning-model paragraph below); `budget-progress`/`budget-dto` in `lib/budget/` survive for the notification path and legacy `get_budgets`.

Recurring (/recurring): a hand-maintained registry of standing charges and income — no detection. Each series carries expectedAmount, cadence (incl. BIMONTHLY), a day window or month-end anchor, the account it hits and a matcher text; the planned-items engine generates its dated instances forward and links arrivals back.

In-app notifications: a header bell surfaces alerts generated from the user's data — a planned charge due within days, a matched charge that deviated >15% from its expected amount, a planned item whose window closed with nothing (MISSED), the savings transfer not executed near month end, per-account projected low balance (with the covering transfer size), consent expiry and stale-sync warnings. Generation is idempotent (upsert by `(userId, dedupeKey)` on the `Notification` model); the planned-items engine writes the deviation/MISSED alerts at matching time and the daily cron (`app/api/cron/sync`) plus the "Check now" action produce the rest. Pure generators live in `lib/notifications/generators.ts` (gather/upsert in `generate.ts`); UI in `components/notifications/`. Push/email are future channels.

Upcoming (/forecast): the planned-items list (series instances and one-offs together, ordered by date, with PENDING/MATCHED/MISSED status) plus per-account coverage cards and the 60-day daily balance projection fed by planned items (charges on their window's first day, income on its last) and a 90-day variable daily spend rate. Pure math in `lib/analytics/cashflow.ts`; assembly shared with the cron in `lib/analytics/cashflow-data.ts`.

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

Traceability: Reports carries an **Untracked spending** card — ATM cash + monthly card settlements (`lib/analytics/traceability.ts`) — because while that ~7% share is dark, every budget can look met while overspending. The goal is reducing the cash itself, not cataloguing it. Accounts can carry a **holder** (`BankAccount.ownerName`, edited inline on /accounts) feeding the income-concentration indicator (`lib/analytics/household.ts`).

Planning model v3: `planned_items` are the source of truth — recurring series (hand-maintained CRUD on /recurring, `RecurringSeries` with expectedAmount, day windows, month-end anchor, BIMONTHLY cadence and a matcher text) generate dated instances forward, one-offs are typed by hand, and a matching engine (`lib/planned/`) links arriving transactions FIFO with a tolerance that crosses the month border, so a matched transaction books in its item's budget month (accrual); closed tolerance flips to MISSED and the month stays provisional through day 7. Accounts carry NO semantics (no savings account, no envelopes — planning is always consolidated; only the cash-flow projection is per-account) and savings is DERIVED: the month's consolidated balance change, shown in /plan's reconciliation block next to actual result, performance vs plan and a flows-vs-balance discrepancy check. The monthly cascade (`lib/budget/cascade.ts`, /plan "Budget") is expected income − expected charges − rollover quotas − variable budget = the EXPECTED RESULT, the month's goal — always expected amounts; reality lands in performance. A category objective is composed: the recurring charges of its category subtree (the series are the automation of the monthly control — category required, no account field) plus the manual amount on top; consumed accumulates ALL the month's expense transactions of the subtree, and the row expands to show both the recurrings and the transactions. Objectives always show % consumed next to % of month elapsed; rollover ones (`budget_items.rollover: true`, balance derived, auto-propagated month to month) have inverted polarity. Recurring detection exists only as editable suggestions on /recurring (`lib/recurring/detect.ts`; dismissals persisted), and matching is internal machinery for missed/deviation alerts and cash-flow dates. The operating view is WEEKLY (`lib/budget/weekly.ts`, dashboard): a recalculated daily rate (no carry-over, no month-boundary special case), an operations counter against a 12-week median, and an informative composition. The daily cash-flow projection feeds from planned items.
