# Architecture

## High-Level Structure

- `app/`: routes, layouts, pages, API routes, and server actions
- `components/`: reusable UI and domain components
- `components/ui/`: base UI primitives (shadcn-based)
- `components/layout/`: app shell pieces (sidebar, header, `theme-provider`, `page-header`)
- `lib/`: business and integration logic
- `prisma/`: schema and migrations
- `scripts/`: operational scripts
- Tests live next to code as `lib/**/*.test.ts` (Vitest, config in `vitest.config.ts`);
  CI is `.github/workflows/ci.yml`.

## Deployment Context

- Primary deployment platform: Vercel.
- Architecture decisions should assume Vercel hosting/runtime constraints and capabilities by default.
- When multiple implementation options exist, prefer Vercel-native features unless there is a clear technical reason not to.
- Project `estalvify` (`projectId: prj_MwnNS5SFs4qNiRu6G6DFfrzYbYjI`); production
  at `https://estalvify.vercel.app`. Every branch push creates a preview
  deployment; merges to `main` promote to production. Vercel-native features in
  use: Cron (`vercel.json` → `/api/cron/sync`) and Queues
  (`/api/queues/sync-connection`).
- Tooling access to Vercel: a read-scoped API token is exposed as the
  `VERCEL_TOKEN` environment variable (secret — never commit or print it). Use it
  with the REST API at `https://api.vercel.com` to look up deployment URLs,
  status, and logs. After a branch push or PR, report the preview URL: query
  `/v6/deployments?projectId=…&target=preview` and match `meta.githubCommitRef`
  to the branch. See `CLAUDE.md` → "Deployment & preview URLs" for the exact call.

## Route Groups

- `app/(auth)/`: authentication routes and auth layout
- `app/(app)/`: authenticated application routes and app shell

## Layer Responsibilities

- `app/**/page.tsx`
  - Compose feature sections
  - Fetch/orchestrate data
  - Delegate interactions to components and actions
  - Serialize server data before passing it to client components

- `components/ui/*`
  - Base visual primitives used across the app
  - Single source for buttons, cards, dialogs, inputs, badges, selects, etc.
  - Shared building blocks added here: `empty-state` (placeholder states),
    `simple-select` (flat Radix select wrapper), plus `layout/page-header`
    (title/subtitle/actions) and `categorize/category-select` (hierarchical picker).
  - Theming: `.dark` OKLCH tokens live in `app/globals.css`; runtime toggle via
    `components/layout/theme-provider` (`next-themes`). Never hardcode colors.

- `components/<domain>/*`
  - Domain-aware UI components (accounts, settings, transactions, categorize)
  - Prefer explicit device views when UX differs by form factor:
    - `FeatureDesktopView`
    - `FeatureMobileView`
    - `FeatureView` switcher and `shared/*` building blocks

- `lib/*`
  - Non-visual domain logic
  - Integration logic (banking sync, categorization internals, queue helpers)
  - Banking helpers: `banking/sync` (sync engine), `banking/enable-banking`
    (PSD2 client), `banking/transaction-parse` (pure ID/remittance parsing),
    `banking/sync-errors` (pure 401/429 classifiers), `banking/connection-status`
    (`expireStaleConsents` — flips connections past `consentExpiresAt` to EXPIRED).
  - Writing rules: `description` holds the merchant, `remittanceInfo` the bank's own
    label. For BBVA card payments that label is a merchant **category** ("PAGO CON
    TARJETA EN SUPERMERCADOS"), which is usually the better rule target — it covers
    merchants never seen before. For other operations it is coarse ("ADEUDO A SU
    CARGO", "TRANSFERENCIAS", "BIZUM") and the merchant must come from `description`.
  - Money totals: `Category.kind` (`EXPENSE` / `INCOME` / `TRANSFER`) is the single
    property every sum derives from — never a hardcoded list of names or ids.
    `buildMonthlySpendingWhere` counts EXPENSE only; `monthlyIncomeExpenses` skips
    TRANSFER so a movement between the user's own accounts stops inflating income
    and expenses at once. An uncategorized row still counts by `direction`:
    dropping it would understate every month. Replaced the dead `isNonComputable`
    boolean, which nothing read.
  - Category tree: `lib/categories/hierarchy.ts` (pure) guards re-parenting —
    cycles, self-parenting, and the two-level limit the pickers assume. Nesting is
    a UI constraint, not a schema one; the schema allows any depth.
  - Sync health: a PSD2 consent lasts a fixed 90 days
    (`banking/enable-banking.ts`), and once it lapses every sync producer filters
    on `status: "ACTIVE"` and skips the connection **silently** — an outage can run
    for weeks unnoticed. Two notifications guard this: `CONSENT_EXPIRING` warns at
    14/7/3 days before expiry (the one that actually prevents a gap) and
    `NO_TRANSACTIONS` catches the other failure modes, measured on the newest
    transaction rather than `BankAccount.lastSyncAt` — that field stays fresh even
    when the transactions endpoint 404s. Reconnecting enqueues a sync immediately
    instead of waiting for the nightly cron.
  - Rule engine: `lib/rules/` — `rule-matcher.ts` and `rule-plan.ts` are **pure**
    (condition evaluation; run ordering, precedence and the undo trail), `apply.ts`
    does the loading and writing, `rule-evaluator.ts` is only the SQL prefilter and
    `rule-dto.ts` holds the types plus `normalizeText` / `parseConditions`.
    Matching runs **in memory**, not as a Prisma `where`: accent folding, word
    boundaries, regex and the `any` field are not expressible in SQL without the
    Postgres `unaccent` extension, and with ~1.5k rows per user the prefilter +
    in-memory pass is cheap. `apply.ts` is the single execution path — both the MCP
    layer and `app/(app)/rules/actions.ts` go through it, so run semantics cannot
    drift. Rules run in **ascending priority** (lower number first, `createdAt`
    tie-break), **first match wins**, and a `MANUAL` categorization is never
    overwritten without an explicit `force`. Every run records an undo trail
    (`previousCategoryId` / `previousSource`) so `undoRuleRun` can revert it, and
    refreshes `matchCount` / `lastRunAt` / `lastMatchAt` on the rule. Rules also run
    automatically at the end of a sync (uncategorized rows only). Deleting a rule
    (`deleteRuleForUser`, shared by the UI action and `delete_rule`) detaches the
    categorizations it produced instead of cascading them away — they keep their
    category but can no longer be undone, which is why the UI confirms first.
  - Planning: `lib/plan/` — `plan-item.ts` (pure: monthly equivalents, per-month net
    for the forecast, per-category limits) and `plan-dto.ts` (server→client view model).
    Reuses `lib/budget/budget-progress` for the limit bars.
  - Formatting: always render money/dates via `lib/formatters`
    (`formatCurrency` / `formatDate`), never ad-hoc `toLocaleString`.
    Two **independent** regional prefs drive these (see `lib/user-prefs.ts`):
    `locale` (number format — decimal/thousands separators) is passed to
    `formatCurrency`; `language` (date language, default `en-GB`) is passed to
    `formatDate`. Never reuse `locale` for dates — pass `language` (threaded to
    client components as a `dateLocale`/`userLanguage` prop). Both are editable in
    Settings ("Number format" and "Language").

- `app/**/actions.ts`
  - Server actions for mutations

- `app/api/**/route.ts`
  - API handlers and webhook/sync endpoints

## MCP API

An MCP (Model Context Protocol) server exposes app actions to MCP clients
(e.g. Claude), authenticated with an OAuth 2.1 Authorization Server that
**delegates the human login to the existing Auth.js Google flow**. Personal /
household scope. Access tokens are self-verifying JWTs (HS256, signed with
`MCP_JWT_SECRET` or `AUTH_SECRET`); auth codes and refresh tokens are opaque and
stored hashed.

- Endpoints: `/api/mcp` (Streamable HTTP, via `mcp-handler`),
  `/api/oauth/{authorize,token,register}`, and discovery metadata at
  `/.well-known/oauth-authorization-server` + `/.well-known/oauth-protected-resource`.
- `lib/mcp/oauth.ts` — PKCE (S256), opaque-token hashing, JWT sign/verify.
- `lib/mcp/store.ts` — Prisma-backed clients / single-use codes / refresh tokens
  (`McpOAuthClient`, `McpAuthCode`, `McpRefreshToken`).
- `lib/mcp/tools.ts` — tool registry. **Every tool derives `userId` from the
  token and scopes all access to it** (same multi-user rule as the rest of the
  app). Tools reuse `lib/*` logic. Reads: `list_transactions` (date-range +
  pagination + **category filter and per-category counts** — returns both
  `description` and `remittanceInfo` plus the categorization source, which is what
  makes a misfiring rule debuggable), `list_categories`, `list_accounts`,
  `get_budgets`, `list_rules` (with run metrics), `test_rule` (evaluate conditions
  without saving). Writes: `bulk_categorize` (`lib/mcp/categorize.ts`, capped),
  category create/edit/delete and rule create/edit via `lib/mcp/manage.ts`
  (parameterized by userId), `run_rule` (supports `dryRun` and `force`),
  `undo_rule_run` and `delete_rule` via `lib/rules/apply.ts`, `sync_connections`
  (enqueues).
- **Auditing the category tree from MCP.** `list_transactions` takes a
  `categoryId` (subcategories included by default, via the pure `subtreeIds` in
  `lib/categories/hierarchy.ts`) and `categoryCounts: true`, which adds the count
  per category over the same filtered set — every visible category *including
  those at zero*, deleted categories that still hold rows, and an `uncategorized`
  total. Without those counts the tree can't be audited from a client at all: an
  empty or near-empty category is only visible as an absence. `REJECTED`
  categorizations count as uncategorized, matching `buildUncategorizedWhere`.
- **`delete_category`** (`deleteCategoryForUser`) is the settings soft delete
  (`isActive: false`, category + subcategories) plus the two things a client can't
  see for itself. It **refuses** while transactions are filed under the category —
  a soft-deleted category still holds them and the categorize inbox never picks
  them up, so they would be stranded — unless the caller passes
  `reassignToCategoryId` (moved, MANUAL/APPROVED, rule link dropped) or
  `force: true` (categorization deleted, so they return to the inbox). Rules
  *targeting* the category are **deactivated**, because `runRules` filters on the
  rule's own `isActive` and never on its target category, so they would otherwise
  keep categorizing into a deleted category. Plan items, recurring series, budget
  items and rules using it as `sourceCategoryId` are only reported.

### Access control

- **Sign-in allowlist**: when `ALLOWED_EMAILS` is set, the Auth.js `signIn`
  callback (`auth.ts`) only lets those Google accounts in — locking both the app
  and the MCP (which shares the login) to the owner. This is the decisive
  control: only an allowed account can ever obtain an MCP token.
- **Confidential client** (`lib/mcp/clients.ts`): when `MCP_OAUTH_CLIENT_ID` is
  set, open Dynamic Client Registration is disabled and only that client id is
  accepted; with `MCP_OAUTH_CLIENT_SECRET` set, the token endpoint authenticates
  the client (client_secret_post/basic). Redirect URIs are validated against
  `MCP_OAUTH_REDIRECT_URIS` (Anthropic hosts also trusted for the static client).
  PKCE (S256) is always required.

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

## Cached Reads

Pages read live from Prisma. The one exception is a value the **app shell**
needs on every navigation but is too expensive to recompute there: the Recurring
"to review" count, which requires running detection over ~13 months of
transactions (`lib/recurring/review-count.ts`).

Rules for that kind of value:

- Wrap the computation in `unstable_cache` with the `userId` in the key parts —
  never cache anything user-scoped without it.
- Tag the entry (`recurring-review-count:<userId>`) and expire it from the server
  action that invalidates it, via `updateTag` (immediate, read-your-own-writes).
  `revalidateTag` in Next 16 needs a cache-life profile as its second argument.
- Give it a TTL as well, for the paths that change the value without going
  through an action (a sync importing new transactions).

## Server to Client DTO Boundary

Do not pass ORM-rich objects directly to client components.

Rules:

- Use DTO mappers in `lib/**` for server -> client payloads.
- Convert non-serializable values (`Date`, `Decimal`, class instances) to plain values.
- Keep DTOs stable and reusable across desktop/mobile views for the same feature.
