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

## Budget and Reporting Terms

- Monthly budget: spending target per month and category/group.
- Reports: summaries and trends over transactions and budgets.

## Operational Terms

- Queue: async processing mechanism for background tasks.
- Job: a queued unit of work (for example sync processing).
- Idempotent: safe to execute multiple times without inconsistent duplication.
- Design tokens: semantic CSS variables (OKLCH) in `app/globals.css` that drive
  light/dark theming — e.g. `background`, `foreground`, `muted`, `success`, `warning`, `brand`.
