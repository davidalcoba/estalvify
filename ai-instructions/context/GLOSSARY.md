# Glossary

## Product Terms

- Personal finance app: application for users to track accounts, transactions, budgets, and reports.
- Multi-user: each authenticated user has an isolated data space.

## Banking Terms

- Bank connection: a linked authorization/session to access a bank provider (Enable Banking / PSD2).
- Bank account: an account fetched under a bank connection.
- Sync: importing latest account and transaction data.
- Daily extraction: scheduled recurring sync process for fresh data.
- Consent / `consentExpiresAt`: the PSD2 authorization has a limited lifetime; when it
  lapses the bank returns 401 and the connection is marked `EXPIRED`.
- Reconnect: re-authorizing an `EXPIRED` connection to get a fresh consent (preserves
  the existing accounts and history).

## Categorization Terms

- Manual categorization: user assigns category directly.
- Rule-based categorization: category assignment by user-defined rules.
- (AI suggestion: reserved for a future flow; not implemented.)

## Planning and Reporting Terms

- Plan: the single place a user declares expected income and expenses by hand. Replaces
  the old month-by-month Budget. Lives at `/plan`.
- Plan item (`PlanItem`): one standing planned entry — an income or expense with an amount,
  a category (required for expenses), and a cadence. Several are allowed per category.
- Cadence (`PlanCadence`): how often a plan item recurs — weekly, monthly, quarterly,
  yearly, or one-off (a single dated entry).
- Category limit: a category's steady monthly planned total (sum of its periodic items),
  tracked against real spending with the `ok/warning/over` status model.
- Forecast: the projected balance over the next months, driven by the Plan's monthly net
  (historical-average fallback when there is no Plan yet).
- Recurring series: an auto-detected recurring charge from bank history; can be added to
  the Plan.
- Reports: summaries and trends over transactions and spending.
- (Budget: the previous per-month, one-amount-per-category planning model, now replaced by
  the Plan; `/budget` redirects to `/plan`. The `Budget`/`BudgetItem` tables remain but are
  unused by the app; `lib/budget/budget-progress` is reused for limit math.)

## Operational Terms

- Queue: async processing mechanism for background tasks.
- Job: a queued unit of work (for example sync processing).
- Idempotent: safe to execute multiple times without inconsistent duplication.
- Design tokens: semantic CSS variables (OKLCH) in `app/globals.css` that drive
  light/dark theming — e.g. `background`, `foreground`, `muted`, `success`, `warning`, `brand`.
