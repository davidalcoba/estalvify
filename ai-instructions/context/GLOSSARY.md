# Glossary

## Product Terms

- Personal finance app: application for users to track accounts, transactions, budgets, and reports.
- Multi-user: each authenticated user has an isolated data space.

## Banking Terms

- Bank connection: a linked authorization/session to access a bank provider.
- Bank account: an account fetched under a bank connection.
- Sync: importing latest account and transaction data.
- Daily extraction: scheduled recurring sync process for fresh data.

## Categorization Terms

- Manual categorization: user assigns category directly.
- Rule-based categorization: category assignment by user-defined rules.
- AI suggestion: model-proposed category pending user confirmation.

## Budget and Reporting Terms

- Monthly budget: spending target per month and category/group.
- Reports: summaries and trends over transactions and budgets.

## Operational Terms

- Queue: async processing mechanism for background tasks.
- Job: a queued unit of work (for example sync processing).
- Idempotent: safe to execute multiple times without inconsistent duplication.
