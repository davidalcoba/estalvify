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
- Tooling access to Vercel: an API token is exposed as the `VERCEL_TOKEN`
  environment variable (secret — never commit or print it). It is **not
  read-only** — it can write project configuration, and the env var layout below
  was built with it (creating `DIRECT_URL`, re-targeting 17 vars, deleting 15).
  Use it
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

The same reasoning bounds which *other* secrets carry a `development` target, since
that target is a download path onto a laptop. `ENABLE_BANKING_PRIVATE_KEY` (the
RS256 key signing PSD2 requests — the most sensitive credential here) and
`CRON_SECRET` are `production` + `preview` only; they are copied into `.env.local`
by hand on the rare occasion local work needs them. `AUTH_GOOGLE_SECRET` and
`AUTH_SECRET` do keep `development`, because without them local Google sign-in
does not work at all — the honest trade, revisited if a localhost-only OAuth
client is ever set up. README → "Setting up a local machine" has the recipe,
including why the pull goes to `.env` and hand-set values to `.env.local`.

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
of them could be read by the tools they exist for anyway — this project's
resource↔project connection carries the environment-variable prefix `DATABASE`,
so the compatibility names arrived as `DATABASE_POSTGRES_URL` and
`DATABASE_PGHOST` while `@vercel/postgres` looks for `POSTGRES_URL` and libpq for
`PGHOST`. The prefix is a **per-connection setting, not something every
Marketplace integration does automatically**: Vercel's docs are explicit that by
default "these variables use the names provided by the integration (for example,
`PGHOST`, `PGPASSWORD`)", and that a **Custom Prefix** chosen when connecting the
project is "prepended to each environment variable name with an underscore
separator" (`PGHOST` → `DB1_PGHOST`). Neon documents the same thing from its side
— its default set is unprefixed (`DATABASE_URL`, `DATABASE_URL_UNPOOLED`,
`PGHOST`, `POSTGRES_*`) and "you can add a prefix if you have multiple databases
in the same project". So do not expect the prefix to reappear by itself if the
integration is ever reinstalled: check the actual names rather than assuming
either shape.

**Open question — the naming does not fully add up, so do not treat "prefix
`DATABASE`" as settled.** A uniform `DATABASE` prefix over Neon's documented
default set would have produced `DATABASE_DATABASE_URL`, because `DATABASE_URL`
is itself one of the defaults. What was actually observed is `DATABASE_URL` and
`DATABASE_PGHOST` side by side — i.e. the prefix appears to sit on *mixed* base
names (`URL` in one case, `PGHOST` in the other), which no single documented rule
explains. This cannot be closed from inside the project: resolving the store
behind it needs endpoints `VERCEL_TOKEN` cannot reach (`GET /v1/storage/stores`
→ 403; `GET /v1/storage/stores/{storeId}` → 404 "Integration Resource not
found"). Settle it from the Vercel dashboard — the resource's **Projects** tab
shows the connection's actual Custom Prefix — before relying on any predicted
name. The project does not depend on `@vercel/postgres`
regardless; it uses
`@neondatabase/serverless` + `@prisma/adapter-neon`, both driven by
`DATABASE_URL`. Until they were deleted they were also exposed to `preview` and
`development`, so the first person to reach for one from a preview would have got
production.

The deletion sticks — routine deploys do not recreate them; only re-syncing or
reinstalling the integration does. If that happens, delete them again rather than
narrowing their targets, and check `GET /v10/projects/{id}/env` for any
`DATABASE_*` key that is not `DATABASE_URL`.

**Production `DATABASE_URL` is still owned by the integration, not by us.** This
is the sharp edge of the paragraph above, and it is easy to get backwards. Of the
seven database vars, six were created by hand and carry `contentHint: null`. The
seventh — `DATABASE_URL` on `production` (env id `ue3mIm16Bn8yvTCN`) — is the
integration's own variable, never replaced, and `GET /v10/projects/{id}/env`
reports it as:

```json
"contentHint": { "type": "integration-store-secret",
                 "storeId": "store_w3Yl5Q1q6j5juAgh",
                 "integrationConfigurationId": "icfg_iw9I9X2qRGUjuj1sxJLkKOOm" }
```

So production's database URL is **not** hand-managed; it is a live store secret
still linked to the Neon resource. The unresolved question that follows: **would
re-syncing or reinstalling the integration overwrite it?** A store secret is
exactly the kind of value a re-sync is expected to rewrite, and unlike the 15
deleted vars there is nothing to simply delete again — production would silently
start pointing wherever the integration decided. Treat this as **unverified and
load-bearing**:

- Do not re-sync or reinstall the Neon integration without first capturing
  production's current `DATABASE_URL` value, so it can be restored.
- After any integration change, re-read the `production` `DATABASE_URL` and
  confirm the build log still reports the expected Neon endpoint (see
  `scripts/migrate.mjs` below).
- The durable fix, if this turns out to be real, is to replace it with a
  hand-created var (`contentHint: null`) like the other six, so no integration
  action can rewrite production. That is a deliberate trade: it also means Neon
  credential rotations stop propagating automatically.

`GET /v1/storage/stores/{storeId}` returns 404 for `VERCEL_TOKEN`, so neither the
store's current state nor the answer to this question can be settled from inside
the project — check the Vercel dashboard.

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
they clean up differently. The **Neon-Managed** integration does it
git-branch-based: it has an "Automatically delete obsolete Neon branches"
(recommended) toggle that cleans up branches when the git branch is deleted. This
project uses the **Vercel-Managed** (Marketplace) one — confirmed directly:
`GET /api/v2/organizations/org-autumn-pond-35905682` returns
`"managed_by": "vercel"` (org name "Vercel: David's projects", `"plan": "free"`).
Its cleanup is deployment-based instead, and Neon's own docs warn that it
"depends on Vercel's deployment retention policy, which can delay branch deletion
by months". For *this* project that retention is currently 30 days
(`GET /v9/projects/{id}` → `deploymentExpiration`: `expirationDays: 30`,
`deploymentsToKeep: 10`), so the realistic lag here is weeks rather than Neon's
worst case — still far longer than it takes concurrent feature branches to hit
the 10-branch cap, which is exactly what happened. A
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
