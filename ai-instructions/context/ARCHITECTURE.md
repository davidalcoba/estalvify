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
  CI is `.github/workflows/ci.yml`. The other workflow,
  `.github/workflows/prune-neon-branch.yml`, is infrastructure housekeeping —
  see "Databases (Neon)" → branch cap.

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

### Databases (Neon)

Neon project `divine-firefly-20538122` (`neon-coquelicot-window`,
`aws-eu-central-1`), owned by the Vercel-managed Neon org
`org-autumn-pond-35905682`. Every deployment target gets its own Neon branch —
no preview ever writes to production data:

| Deployment           | Neon branch                                 | Wired by                           |
| -------------------- | ------------------------------------------- | ---------------------------------- |
| `main` / production  | `main` (primary, `br-lively-cell-alldlk0k`) | project env vars                   |
| `preview` branch     | `preview` (`br-shy-bird-albcqv1g`)          | env vars with `gitBranch: preview` |
| feature branches     | `preview/<git-branch>`, one per branch      | Neon–Vercel integration            |
| local dev            | `development` (`br-cool-poetry-aln1zge6`)   | project env vars (`development`)   |

The Neon–Vercel integration creates a `preview/<git-branch>` Neon branch the
first time a branch is deployed and injects that branch's connection string into
the deployment. Those injected values win over the project-level env vars, which
is what keeps feature-branch previews isolated.

**Env var layout in Vercel** (the app reads only `DATABASE_URL` at runtime —
`lib/prisma.ts` — and `DIRECT_URL`, falling back to `DATABASE_URL`, for
migrations — `prisma.config.ts`):

| Key            | Target        | `gitBranch` | Points at                           |
| -------------- | ------------- | ----------- | ----------------------------------- |
| `DATABASE_URL` | `production`  | —           | Neon `main`, pooled                 |
| `DIRECT_URL`   | `production`  | —           | Neon `main`, direct                 |
| `DATABASE_URL` | `preview`     | `preview`   | Neon `preview`, pooled              |
| `DIRECT_URL`   | `preview`     | `preview`   | Neon `preview`, direct              |
| `DATABASE_URL` | `preview`     | —           | Neon `preview`, pooled — safety net |
| `DATABASE_URL` | `development` | —           | Neon `development`, pooled          |
| `DIRECT_URL`   | `development` | —           | Neon `development`, direct          |

Every target is paired: a `DIRECT_URL` always names the same Neon branch as the
`DATABASE_URL` next to it, so the database a build migrates is the one the app
then reads.

The generic `preview` `DATABASE_URL` is the safety net: it is only consulted when
the integration does not inject a per-deployment branch, and it points at the
shared non-production `preview` branch rather than production. Previously this
slot held the production URL, which meant any preview that missed the injection
would have connected to — and, since the build runs `prisma migrate deploy`,
migrated — production.

`development` is what `vercel env pull` writes into a local `.env`. It has its
own Neon branch precisely so that pulling env vars, or running `prisma migrate
dev` against them, cannot reach production — and so that a local schema
experiment does not rewrite the history of the shared `preview` branch either.

There is deliberately **no** generic `preview` `DIRECT_URL`. `prisma.config.ts`
prefers `DIRECT_URL` over `DATABASE_URL`, so a generic one would send
feature-branch migrations to the shared `preview` branch while the app ran
against its own ephemeral branch. `DIRECT_URL` exists only where it is scoped to
the same branch as its `DATABASE_URL`.

**`DATABASE_URL` and `DIRECT_URL` are the only database variables.** The
Neon–Vercel integration also wrote ~15 more, holding production credentials in
every shape: `DATABASE_URL_UNPOOLED` (Prisma's "direct URL"),
`DATABASE_POSTGRES_*` (backwards compatibility with the Vercel Postgres SDK) and
`DATABASE_PG*` (the libpq variables, so a bare `psql` connects). All 15 are
**deleted**. Two independent reasons: nothing in the codebase read them, and none
of them could be read by the tools they exist for anyway — a Vercel Marketplace
integration prefixes its variables with the store name, and this store is
`DATABASE`, so the compatibility names arrived as `DATABASE_POSTGRES_URL` and
`DATABASE_PGHOST` while `@vercel/postgres` looks for `POSTGRES_URL` and libpq for
`PGHOST`. The project does not depend on `@vercel/postgres` regardless; it uses
`@neondatabase/serverless` + `@prisma/adapter-neon`, both driven by
`DATABASE_URL`. Until they were deleted they were also exposed to `preview` and
`development`, so the first person to reach for one from a preview would have got
production.

The deletion sticks — routine deploys do not recreate them; only re-syncing or
reinstalling the integration does. If that happens, delete them again rather than
narrowing their targets, and check `GET /v10/projects/{id}/env` for any
`DATABASE_*` key that is not `DATABASE_URL`.

**Branch cap.** The Neon org is on the free plan, capped at **10 branches**
(`GET /api/v2/projects/{id}` → `project.owner.branches_limit`). When the cap is
reached the integration cannot create a branch and the deployment fails at
provisioning with `Resource provisioning failed`, before the build runs — it
fails closed rather than falling through to another database. Three slots are
permanent (`main`, `preview`, `development`); the rest absorb concurrent feature
branches.

`.github/workflows/prune-neon-branch.yml` reclaims a slot automatically: on
`pull_request: closed` it deletes the Neon branch named `preview/<head-ref>`. It
needs a `NEON_API_KEY` repository secret and, when that is missing, logs and
exits 0 rather than reddening every closed PR. Deleting is safe — the
integration recreates the branch from `main` on the next deployment of that git
branch, so the only thing lost is throwaway preview data.

The workflow exists because of *which* integration this is. Neon ships two, and
they clean up differently: the **Neon-Managed** integration has an "Automatically
delete obsolete Neon branches" toggle that fires when the git branch is deleted,
but this project uses the **Vercel-Managed** (Marketplace) one, whose cleanup
instead follows Vercel's deployment-retention policy and so can lag by months —
long enough to hit the 10-branch cap first, which is exactly what happened. A
GitHub Action is Neon's own documented answer for this case
(`neondatabase/delete-branch-action` is the official one; the workflow here is a
few lines of `curl` instead, to avoid pinning a third-party action and to keep
the `preview/`-namespace guard).

`scripts/migrate.mjs` logs `[migrate] target: <neon-endpoint-id> (via <var>)` at
the top of every build. That line is how you confirm from a build log which Neon
branch a deployment actually migrated — Prisma's own "Datasource" line has its
host redacted by Vercel. Map the endpoint id back to a branch with
`GET /api/v2/projects/divine-firefly-20538122/endpoints`.

Tooling note: the Neon API (`console.neon.tech`) is reachable from the Claude
Code environment, and a Neon API key is exposed as `NEON_DB_KEY` (secret — never
commit or print it). Direct Postgres connections (port 5432) are blocked by the
network policy; to query a branch, use Neon's SQL-over-HTTP endpoint
(`POST https://<host>/sql` with a `Neon-Connection-String` header).

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
    The PSD2 `redirect_uri` is never derived from the deployment URL: Enable
    Banking rejects anything that is not an exact match of a URI registered in the
    app config (`REDIRECT_URI_NOT_ALLOWED`), so `ENABLE_BANKING_REDIRECT_URI` is
    set identically on all three Vercel targets and `createBankingSession` throws
    when neither it nor an explicit `redirectUri` is given. `api/banking/connect`
    always passes one, falling back to the request origin — right for localhost,
    where that origin is itself the registered URI. What there is deliberately
    **no** fallback to is a canonical-app-URL variable: a fixed one is either the
    same value as `ENABLE_BANKING_REDIRECT_URI` or wrong, and the deleted
    `NEXT_PUBLIC_APP_URL` was the wrong kind — it held the production URL on
    preview targets.
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
  pagination — returns both `description` and `remittanceInfo` plus the
  categorization source, which is what makes a misfiring rule debuggable),
  `list_categories`, `list_accounts`, `get_budgets`, `list_rules` (with run
  metrics), `test_rule` (evaluate conditions without saving). Writes:
  `bulk_categorize` (`lib/mcp/categorize.ts`, capped), category create/edit and
  rule create/edit via `lib/mcp/manage.ts` (parameterized by userId), `run_rule`
  (supports `dryRun` and `force`), `undo_rule_run` and `delete_rule` via
  `lib/rules/apply.ts`, `sync_connections` (enqueues).

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

## Server to Client DTO Boundary

Do not pass ORM-rich objects directly to client components.

Rules:

- Use DTO mappers in `lib/**` for server -> client payloads.
- Convert non-serializable values (`Date`, `Decimal`, class instances) to plain values.
- Keep DTOs stable and reusable across desktop/mobile views for the same feature.
