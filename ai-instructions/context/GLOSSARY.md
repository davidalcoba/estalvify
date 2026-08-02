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
- Condition tree (`ConditionNode`): a rule's conditions — `{op: "AND"|"OR", children}` where
  a leaf is `{field, operator, value, negate?}`. A bare array is read as an AND group
  (the pre-v2 shape).
- `any` (field): matches description and remittance info together, and is the default.
  `description` holds the merchant; `remittanceInfo` holds the bank's own label, which for
  BBVA card payments is a merchant *category* ("PAGO CON TARJETA EN SUPERMERCADOS"). The
  category is usually the better rule target for card spending — it covers merchants never
  seen before. For non-card operations it is coarse ("ADEUDO A SU CARGO", "TRANSFERENCIAS",
  "BIZUM") and the merchant has to come from `description`.
- `word` (operator): whole-word match. Stops `DIA` matching `CLAUDIA` and `ESCLAT` matching
  `ESCLATOIL`. `matches` is the raw-regex escape hatch.
- Normalization: text comparison folds accents and case on both sides, so `AMORTIZACION`
  matches `AMORTIZACIÓN`.
- Priority: lower number is evaluated first; ties break on `createdAt`. Convention: 0-99
  exclusions and transfers, 100-199 income, 200-299 fixed costs, 300+ variable spending.
- First match wins: within a run, the first rule to match a transaction claims it; later
  rules skip it.
- Precedence: MANUAL > RULE > AI > uncategorized. A run never overwrites a manual
  categorization unless explicitly forced.
- Dry run: evaluate and report without writing, including `conflicts` — transactions more
  than one rule wanted.
- Undo (`undo_rule_run`): reverts everything a rule categorized, using the
  `previousCategoryId` / `previousSource` trail each run records.
- Deleting a rule: detaches the categorizations it produced — the transactions keep their
  category but lose the undo trail. Deactivating (`isActive: false`) pauses a rule instead.
- (AI suggestion: reserved for a future flow; not implemented.)

## Category Terms

- `kind` (`CategoryKind`): what a category means for totals — `EXPENSE` counts as spending,
  `INCOME` as earnings, `TRANSFER` as neither (money moving between the user's own accounts).
  Every sum in the app derives from this, never from a name or id list.
- Two-level nesting: parents and their children only. Enforced on move, because the pickers
  and the settings manager render exactly two levels — a third would be invisible but still
  counted. The schema itself permits any depth.
- (`isNonComputable`: the previous boolean. Seeded on "Transfers" and read by nothing, so no
  total ever excluded anything. Replaced by `kind`.)

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

## Sync Health Terms

- Consent expiry: PSD2 access is granted for a fixed 90 days. On lapse the connection becomes
  `EXPIRED` and every sync producer skips it silently, so the data simply stops.
- `CONSENT_EXPIRING`: preventive notification at 14 / 7 / 3 days before the consent lapses,
  escalating INFO → WARNING → ALERT. One per step per consent; reconnecting starts a fresh series.
- `NO_TRANSACTIONS`: safety net for outages that are not an expiry (dead cron, stuck date window,
  a 404 from the transactions endpoint). Measured on the newest transaction, never on
  `lastSyncAt`, which stays fresh in those failure modes. Re-alerts weekly while stale.
- `UNSUPPORTED:` prefix on `BankAccount.lastSyncError`: the account has no transactions endpoint.
  Not a failure and never retried, but recorded so it can't pass for a healthy account.

## Operational Terms

- Queue: async processing mechanism for background tasks.
- Job: a queued unit of work (for example sync processing).
- Idempotent: safe to execute multiple times without inconsistent duplication.
- Design tokens: semantic CSS variables (OKLCH) in `app/globals.css` that drive
  light/dark theming — e.g. `background`, `foreground`, `muted`, `success`, `warning`, `brand`.
