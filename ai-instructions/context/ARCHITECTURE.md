# Architecture

## High-Level Structure

- `app/`: routes, layouts, pages, API routes, and server actions
- `components/`: reusable UI and domain components
- `components/ui/`: base UI primitives (shadcn-based)
- `components/layout/`: app shell pieces (sidebar, header, `theme-provider`, `page-header`)
- `lib/`: business and integration logic
- `prisma/`: schema and migrations
- `scripts/`: operational scripts
- `ai-instructions/`: the context docs, shared by every AI assistant
- `.claude/`: Claude Code's own config — `settings.json`, `hooks/`, and the
  `skills/` it auto-discovers (`.claude/skills/<name>/SKILL.md` is the only path
  it reads, so a skill placed anywhere else is silently never loaded)
- Tests live next to code as `lib/**/*.test.ts` (Vitest, config in `vitest.config.ts`);
  CI is `.github/workflows/ci.yml`. The other workflow,
  `.github/workflows/prune-merged-branch.yml`, is infrastructure housekeeping —
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
- **Branch flow: feature branch → `preview` → `main`.** Three long-lived refs
  matter: a feature branch (throwaway preview + throwaway Neon branch), `preview`
  (the release candidate, fixed URL `https://estalvify-preview.vercel.app` — a
  project domain pinned to the branch — on Neon branch `preview`), and `main`
  (production). Nothing merges into `main` except `preview`.
  `.github/workflows/release-gate.yml` enforces that on pull requests and
  `sync-preview.yml` fast-forwards `preview` to `main` after each release, because
  `main`'s merge commit would otherwise leave `preview` one commit behind and the
  drift compounds silently — that is how `preview` ended up 6 commits behind once.
  Both are advisory against a direct push to `main` — Actions only run after the
  push, so `sync-preview.yml` also verifies the provenance of what landed and fails
  the release when it did not come through `preview`. The lock itself is the GitHub
  ruleset **"main: solo desde preview" (id `20327850`), applied and `active`**: a
  pull request is required (0 approvals) and both `A PR into main must come from
  preview` and `Typecheck · Lint · Test` must pass, with force pushes and deletion
  blocked, so a direct push is rejected rather than reported afterwards. Its payload
  lives at `.github/rulesets/main-release-path.json` for re-creating or auditing it,
  and `GET /repos/{repo}/rules/branches/main` reports what is in force (empty array
  = the lock is gone). Changing it is a GitHub-UI or personal-token job: a Claude
  Code session cannot, because the sandbox proxy refuses writes to GitHub's
  administration API paths (403 on `POST /repos/{repo}/rulesets`) and the session
  token is `admin: false`. Both required contexts are **job names** — rename a job
  without updating the ruleset and `main` becomes unmergeable, waiting on a check
  that never reports.
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

**Nothing keeps the long-lived `preview` branch's *data* in sync with `main`.** It
drifts: by 2026-08 it still held a 2026-03-02 snapshot with zero rules and a user
row that predated the production one, so the rules page on preview looked empty
while production had 35. Refresh it with Neon's restore endpoint, which keeps the
branch id and endpoint (so the Vercel connection strings keep working — the role
and password are inherited from `main` and already identical):

```bash
curl -X POST -H "Authorization: Bearer $NEON_DB_KEY" -H 'Content-Type: application/json' \
  https://console.neon.tech/api/v2/projects/divine-firefly-20538122/branches/br-shy-bird-albcqv1g/restore \
  --data-binary '{"source_branch_id":"br-lively-cell-alldlk0k","preserve_under_name":"preview_before_reset_<date>"}'
```

It is destructive to whatever only preview had — notably a bank consent
reconnected there, which comes back as production's (expired) connection rows.
`preserve_under_name` keeps the old state as a separate branch; delete it when
done, because the free plan caps the project at 10 branches and a full project
makes preview provisioning fail before the build even runs.

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

One more var is branch-scoped for the same reason:
`ENABLE_BANKING_REDIRECT_URI` on target `preview` with `gitBranch: preview` points
at `https://estalvify-preview.vercel.app/api/banking/callback`, while the unscoped
entry keeps the production callback. PSD2 requires the redirect URI to match a
registered value exactly, so the bank flow can only complete on a deployment whose
origin *is* that registered URI: without the branch-scoped value, a reconnect
started on preview stores its `PENDING_REAUTH` row in Neon `preview`, the bank
returns the user to production, and production looks the `state` up in its own
database and answers `connection_not_found` — the "session expired" that never
expired. Both URLs must stay registered on the Enable Banking side; the Vercel
value alone fails earlier, at session creation. Feature-branch previews still send
the production callback, since a per-deploy origin can never be registered.

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

It has been hit for real: on 2026-08-08 six `preview/` branches from
already-merged pull requests (merged before the prune workflow reached both
`main` and `preview`) held the remaining slots, and every new feature branch
deployed straight to `ERROR / Resource provisioning failed` with **zero build
events** — no log to read, nothing wrong with the code. If a preview fails that
way, count the branches before looking at the diff:
`GET /api/v2/projects/{id}/branches`.

`.github/workflows/prune-merged-branch.yml` reclaims a slot automatically, in two
jobs that answer to different things:

- **`Delete preview/<head-ref>`** runs on *any* `pull_request: closed`, merged or
  abandoned — an abandoned branch holds a slot just as hard. It needs a
  `NEON_API_KEY` repository secret and, when that is missing, logs and exits 0
  rather than reddening every closed PR. Deleting is safe: the integration
  recreates the branch from `main` on the next deployment of that git branch, so
  the only thing lost is throwaway preview data. It always logs the branches
  still in use, so an orphan that survives is visible in the next run.
- **`Delete the merged git branch`** runs only when the pull request actually
  **merged into `preview`**, and deletes the head ref on GitHub. Not on an
  abandoned pull request: closing one is not a decision to throw the commits
  away, and the ref is the only thing still holding them.

Both skip forks and both refuse `main` and `preview` outright. That exclusion is
the point on the release pull request: `preview` → `main` must fall through
untouched, since deleting `preview` would take the release candidate, its fixed
URL and its Neon branch with it. It is also why GitHub's own **"Automatically
delete head branches" repository setting is the wrong tool here** — it has no
idea `preview` is special and would delete it on every release. Leave it off.

**A `pull_request: closed` workflow is resolved from the PR's merge ref** — head
merged into base — not from the base branch alone. This entry used to claim base
only; PR #157 disproved it. That PR renamed the workflow and added the git-branch
job on its *head* while `preview` still carried the old single-job
`prune-neon-branch.yml`, and the run that fired was the **new** one, which then
deleted the PR's own branch. Base-only resolution could not have produced that.

The older measurements fit the merge-ref rule too, which is why they read as
base-only at the time: PR #55 had head `main` at `c711175`, a commit that does not
contain the workflow, and base `preview`, which did — the merge ref had it, so the
run fired. Conversely PR #53 merged with base `main` while the file lived only on
`preview`, its merge ref had no workflow, and it left
`preview/claude/mcp-delete-category-filter-elc9vw` orphaned (deleted by hand
afterwards).

The practical consequence is unchanged: the file has to be on **`main`** as well as
on `preview`, or it silently covers only the PRs targeting the integration branch
and the cap creeps up regardless. It now is, promoted by the `preview` → `main`
release. Keep it that way — a future workflow reshuffle that drops it from `main`
would reintroduce the gap without any signal, since a missing workflow produces no
failed run, just no run at all. What the merge-ref rule adds is that a change to
the workflow takes effect on **its own** pull request, before it has landed
anywhere: convenient (PR #157 pruned itself) and a trap in equal measure, since a
broken edit fails on the pull request that introduces it.

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

## PWA (installable app)

The app installs on Android and iOS from the browser itself — Chrome's "Install
app", Safari's "Add to Home Screen". One codebase serves the web and the mobile
app; there is no native shell and no store distribution, so a deploy reaches
installed users on their next launch with no reinstall and no review.

- **Manifest**: `public/manifest.json`, referenced from `app/layout.tsx`. `id` is
  pinned so a later `start_url` change updates the installed app rather than
  registering a second one. `any` and `maskable` icons are separate files —
  one image serving both gets cropped by Android's adaptive-icon mask.
- **Icons**: everything derives from one geometry definition in
  `scripts/generate-icons.mjs` (`npm exec node scripts/generate-icons.mjs`),
  which writes `app/icon.svg`, `app/apple-icon.png`, `app/favicon.ico`,
  `public/logo*.svg` and `public/icons/*`. `components/brand/logo.tsx` is the
  in-app copy of the same rects — change one, change both.
- **Service worker**: `public/sw.js`, registered by
  `components/layout/service-worker-registration.tsx` **in production only**, so
  none of this is exercised by `npm run dev`. Navigations are network-first with
  `/offline` (`app/offline/page.tsx`) as the fallback; everything else is left to
  the browser's HTTP cache. Bump `CACHE_NAME` whenever the file changes.
- **The precache must stay failure-tolerant.** `cache.add("/offline")` is wrapped
  in `.catch()` because `Cache.put` rejects on a redirected response, a rejected
  `install` means the worker never activates, and without an active worker Chrome
  never offers to install the app. That is not hypothetical: it was the live bug
  — `/offline` did not exist, the request redirected to `/login`, and the app was
  silently uninstallable. Keep `/offline` in the `proxy.ts` public paths.
- **Standalone UX**: the root layout sets `viewport-fit=cover`, so anything at a
  screen edge must use the safe-area utilities in `app/globals.css`
  (`pt-safe`, `pb-safe-4`, `h-header-safe`). See `UI_RULES.md`.
- **Launch screens**: `apple-touch-startup-image` entries in `app/layout.tsx`,
  one exact-resolution PNG per device under `public/splash/`, generated by the
  same script. iOS does **not** derive a splash from the manifest the way
  Android does — without these an installed app shows a blank white screen
  while the first page loads. `/splash` is in the `proxy.ts` public paths
  because iOS fetches the image as the app opens, before any page runs.

### The shell does not block on data

`app/(app)/layout.tsx` awaits `getScope()` and nothing else. It used to
`await Promise.all` three queries before returning markup, which on a cold
start — installed app, cold serverless function, Neon waking — left the screen
blank for seconds. **A route's `loading.tsx` cannot fix that**: a route skeleton
only renders once its *layout* has resolved, so a slow layout has no fallback at
all.

The counts and the bell are therefore passed down unawaited and suspend
individually: `PendingBadge` takes a `Promise<number>` and resolves it with
`use()`, and `AppHeader` takes the bell as a `ReactNode` slot filled by
`NotificationBellData` inside `<Suspense>`. Keep it that way — adding an `await`
for domain data to this layout re-blocks every page in the app.

## Notifications

Two delivery channels over one domain layer. `lib/notifications/generators.ts`
holds the pure spec builders; `generateNotificationsForUser()`
(`lib/notifications/generate.ts`) persists them, called when a sync finishes
(`app/api/queues/sync-connection/route.ts`), from the daily cron
(`app/api/cron/sync/route.ts`) and from the "Check now" action on
`/notifications`.

- **In-app bell** — the source of truth, always written.
- **Web Push** — best-effort, via `lib/notifications/push.ts` and the `push` /
  `notificationclick` handlers in `public/sw.js`. Needs the VAPID env vars; with
  them unset, sending is skipped and the bell is unaffected.
  - **Best-effort is not the same as silent.** `sendPushBatch` returns a
    `PushResult` and records `lastError` on the subscription row, which Settings
    renders. The first version swallowed every failure into `console.error`, and
    on Vercel that made an Apple rejection indistinguishable from "nothing to
    send". `vapidConfigError()` validates the subject and key shapes up front,
    because Apple answers a malformed `VAPID_SUBJECT` with an opaque JWT error.
  - Each member chooses which types may reach their phone (`User.pushTypes`).
    `sendPushToSelf` — the Settings test button — bypasses that filter so
    someone who switched everything off can still answer "is push working?".

Three constraints worth knowing before touching this:

- Generation is idempotent and re-runs daily, so **push is limited to specs that
  did not already exist** (`unseenSpecs()`, read *before* the upsert). Pushing
  the whole spec list re-notifies the same alert on every cron run.
- **Generation runs when a sync finishes.** The cron only *enqueues* the syncs
  before calling it, so on its own it always evaluated data from before the
  sync landed and any push announced a day-old event.
- Copy lands on a lock screen: keep titles and bodies short, and **do not assert
  on their exact wording in tests**. Assert the fact (the day count, the amount)
  so the copy stays free to change.
- Notifications are anchored at the household's `dataUserId`, but every member
  sees them, so **push fans out to all household members**, not just the anchor.
  Subscriptions are stored per member (`actorUserId`) because they belong to a
  device — which is also why the settings toggle is available to a `VIEWER`.
- **iOS only delivers push to installed PWAs.** In a Safari tab `PushManager`
  does not exist, so `components/settings/push-toggle.tsx` explains the install
  step instead of offering a control that cannot work.

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
    drift. Rules run **in list order** — `rule-order.ts` (pure) holds the move and
    validation helpers, `priority` stores the 0-based position and is renumbered
    contiguously by `reorderRulesForUser` (one transaction, and it rejects an order
    that isn't exactly the user's full rule set); the /rules list reorders by
    drag-and-drop (pointer events, so touch works too; arrow keys on the handle
    move a rule as well) and `reorder_rules` does the same over MCP. On mobile the
    primary control is the up/down buttons next to the handle, not the drag: a card
    is ~90px tall, so a touch drag has to travel about that far before the list
    reacts (measured in a Playwright touch harness — the mechanics work, the
    ergonomics do not), and the handle is a small target beside it. The number is
    never exposed in the UI, and a new rule is appended **last**
    (`nextRulePriority`) so it can't outrank existing ones. **First match wins**,
    `createdAt` breaks a tie, and a `MANUAL` categorization is never
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
    Settings ("Number format" and "Language"). Since multi-user phase 5,
    `getUserPrefs(dataUserId, actorUserId)` is THE module that splits personal
    from household prefs: `locale`/`language`/`timezone` come from the ACTING
    member's row (each member renders the app their way — pages pass
    `scope.actorUserId`), `currency` from the owner's (totals never change
    currency per member). Callers without a member context (cron, MCP) pass
    only `dataUserId` and get the owner's bundle.

- `app/**/actions.ts`
  - Server actions for mutations

- `app/api/**/route.ts`
  - API handlers and webhook/sync endpoints

## MCP API

An MCP (Model Context Protocol) server exposes app actions to MCP clients
(e.g. Claude), authenticated with an OAuth 2.1 Authorization Server that
**delegates the human login to the existing Auth.js Google flow**. Personal /
household scope. Access tokens are self-verifying JWTs (HS256, signed with
`MCP_JWT_SECRET` — set on Vercel for `production` + `preview` since
2026-08-05 — falling back to `AUTH_SECRET` with a production warning);
auth codes and refresh tokens are opaque and stored hashed. Tokens carry an
`iss` claim bound to the deployment target (`estalvify-mcp:<VERCEL_ENV>`), so a
token minted on preview is not valid against production even when both share a
signing secret. Since multi-user phase 4 they also carry the household claims
`du` (the owner's userId — the data scope every tool filters by) and `role`;
the granted scope is intersected with the role (`scopesForRole`, pure +
tested: a VIEWER's token is read-only, exactly `["read"]`, never `[]`) at
mint, at refresh (context re-resolved on every rotation, so role changes
propagate ≤ 1 h) and at verify. Legacy claim-less tokens mean own-owner and
age out within the hour. The consent screen shows the household and tells a
VIEWER the connection will be read-only.

- Endpoints: `/api/mcp` (Streamable HTTP, via `mcp-handler`),
  `/api/oauth/{authorize,token,register,revoke}`, the consent screen at
  `/oauth/consent`, and discovery metadata at
  `/.well-known/oauth-authorization-server` + `/.well-known/oauth-protected-resource`.
- **Consent + scopes**: `/api/oauth/authorize` validates the request and sends
  the signed-in user to `/oauth/consent`, which shows the client and the scopes
  and mints the code only on explicit approval (the server actions re-validate
  everything — the form fields are transport, not trusted state). Two scopes
  (`lib/mcp/scopes.ts`, pure + tested): `read` and `write`. A client that
  requests no scope (MCP clients usually don't) is granted both — full access
  stays the default, but the user now sees it. Every tool declares read/write
  via `requireUserId(extra, scope)`, so a read-only token gets an error from
  write tools; tokens without a scope claim (legacy) keep full access and age
  out within the hour.
- **Refresh-token rotation + revocation**: the `refresh_token` grant retires
  the presented token atomically and issues a replacement — a replayed token
  gets `invalid_grant`. The grant also re-checks `ALLOWED_EMAILS`, so a removed
  user stops minting access tokens at the next refresh instead of in 30 days.
  `/api/oauth/revoke` (RFC 7009) revokes refresh tokens, client-authenticated,
  200 either way (no validity oracle). `lib/auth/revoke.ts` is the active kill
  switch: deletes the user's Auth.js sessions and revokes their MCP refresh
  tokens in one transaction.
- **Rate limiting** (`lib/rate-limit.ts`): Postgres-backed fixed-window
  counters (serverless invocations share nothing else; the `rate_limits` table
  is the store). Applied per IP on the anonymous endpoints —
  `/api/oauth/{token,register,authorize,revoke}` and `/api/banking/callback`.
  Fails open on DB errors (the DB being down is already a full outage) and the
  daily retention purge clears stale windows.
- `lib/mcp/oauth.ts` — PKCE (S256), opaque-token hashing, JWT sign/verify.
- `lib/mcp/store.ts` — Prisma-backed clients / single-use codes / refresh tokens
  (`McpOAuthClient`, `McpAuthCode`, `McpRefreshToken`).
- `lib/mcp/tools.ts` — tool registry. **Every tool derives the household's
  `dataUserId` from the token (`du` claim; legacy fallback = the actor) and
  scopes all access to it** (same multi-user rule as the rest of the app —
  `requireUserId(extra, scope)` mirrors `requireScope`). Tools reuse `lib/*` logic. Reads: `list_transactions` (date-range +
  pagination + **category filter and per-category counts** — returns both
  `description` and `remittanceInfo` plus the categorization source, which is what
  makes a misfiring rule debuggable), `list_categories`, `list_accounts`,
  `get_budgets` (LEGACY — budgets were replaced by the Plan; read-only), `list_plan_items`,
  `list_rules` (with run metrics — `neverMatched` means `lastMatchAt === null` after at
  least one run, never "zero matches in the last run"), `test_rule` (evaluate conditions
  without saving). Writes: `bulk_categorize` (`lib/mcp/categorize.ts`, capped),
  category create/edit/delete, rule create/edit and **plan item create/edit/delete**
  via `lib/mcp/manage.ts` (parameterized by userId; plan items mirrored from a
  confirmed recurring series are refused — the series owns them), `run_rule`
  (supports `dryRun` and `force`), `undo_rule_run` and `delete_rule` via
  `lib/rules/apply.ts`, `sync_connections` (enqueues).
  `lib/mcp/tools-schema.test.ts` parses the registry and fails the build when a
  handler reads a parameter its declared inputSchema doesn't carry (or declares one
  it never reads) — that drift shipped three times before the test existed.
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

- **Registration is closed by default**: the Prisma adapter auto-provisions a
  `User` row on first sign-in — login and registration are the same door — so
  the `signIn` callback additionally requires that a user with that email
  **already exists** in the database unless `ALLOW_SIGNUP` is explicitly
  truthy (`lib/auth/signup-policy.ts`, pure + tested, fail-closed on typos).
  With only the owner's row in the table, nobody else can enter even if the
  allowlist were opened by mistake — the two gates fail independently. The
  flag's one legitimate use is bootstrapping a fresh database (first login has
  no row to match): set it, log in once, unset it. The existence check is
  case-insensitive, because a hand-seeded row with different casing would
  otherwise lock the owner out.
- **Household invitations** (`lib/household/`, PLAN_MULTIUSER.md phase 2): an
  owner invites by email + role from Settings → Household members; the link
  `/invite/<token>` carries a one-time raw token (only its hash is stored,
  7-day TTL) and acceptance requires the **session email to match the invited
  email** — a forwarded link admits nobody. Invites are an **additive** third
  way through both sign-in gates below: a live invite or an existing
  membership passes the allowlist gate when it misses, and a live invite
  authorizes the user-row creation the closed-signup gate would refuse.
  `proxy.ts` accepts the same disjunction on live sessions (the lookup runs
  only when the allowlist misses) and preserves `callbackUrl` when bouncing
  to /login so invite links survive the round-trip. Removing a member calls
  `revokeUserAccess` (sessions + MCP refresh tokens, immediate).
- **Sign-in allowlist**: when `ALLOWED_EMAILS` is set, the Auth.js `signIn`
  callback (`auth.ts`) only lets matching Google accounts in — locking both the
  app and the MCP (which shares the login) to the owner. This is the decisive
  control: only an allowed account can ever obtain an MCP token.
  The list is enforced on **live** access too, not just at sign-in: `proxy.ts`
  checks the session's email on every request (pure string match, no extra
  query) and, on a miss, calls `revokeUserAccess` — deleting the user's session
  rows and revoking their MCP refresh tokens — before bouncing to /login; and
  the token endpoint re-checks the allowlist on every `refresh_token` grant.
  Removing an email therefore cuts app access on the user's next request and
  caps MCP access at the last access token's remaining lifetime (≤ 1 hour),
  instead of the old worst case of 30 days.
  The matching is `lib/auth/allowed-emails.ts` — pure and unit-tested, so the one
  rule that decides who gets in is not buried in an Auth.js callback. Entries are
  an exact address, a whole domain (`example.com`, `@example.com`, `*@example.com`
  are the same thing), a subdomain wildcard (`*.example.com`), one mailbox at any
  domain (`postmaster@*`), or `*` for everyone. `*@*` and `@*` are **rejected**
  rather than aliased to `*`: a wildcard domain only means something beside a
  concrete local part, and "everyone" is the entry that most deserves a single
  spelling. Since rejected entries are dropped, writing `*@*` alone denies sign-in
  instead of opening it. `*.example.com` deliberately excludes the apex, following DNS and TLS
  wildcard convention: a wildcard label stands for one or more labels, not zero,
  and quietly including the apex would make `*.example.com` and `example.com`
  indistinguishable. Two properties are load-bearing and have tests naming them:
  a domain entry never matches a domain that merely *ends with* it
  (`example.com` must not admit `notexample.com`), and a malformed entry (`@`,
  `user@`) is discarded rather than treated as a catch-all. An empty list still
  means open, for compatibility; `*` is the way to say so on purpose. But a value
  that has entries and no *usable* ones denies everyone rather than falling
  through to open — otherwise a typo in the only entry would swing the allowlist
  from one address to the whole world, and the "malformed entries are discarded"
  guarantee would only hold while some other entry happened to parse. Being
  locked out is recoverable; the opposite is not. That case was a real bug caught
  by these tests, not a hypothetical.
- **Confidential client** (`lib/mcp/clients.ts`): **configured** — both
  `MCP_OAUTH_CLIENT_ID` and `MCP_OAUTH_CLIENT_SECRET` are set on `production` and
  `preview`, so `isDcrDisabled()` is true and open Dynamic Client Registration
  returns 403, with the token endpoint authenticating the secret
  (client_secret_post/basic). Only deployments **built after** the variables were
  created see them — Vercel injects env vars at build time, so an already-running
  deployment keeps answering `201` until it is redeployed. Verified by `POST`ing to
  `/api/oauth/register` on a preview built afterwards (403 `access_denied`) versus
  one built minutes before (201). This closed the app's only
  unauthenticated write path — `POST /api/oauth/register` took anonymous requests
  and wrote an `McpOAuthClient` row per call, with no rate limit. `ALLOWED_EMAILS`
  always bounded the damage to database rows rather than data access, since a
  token still requires an allowed Google account, but the endpoint had no business
  being open on a single-user deployment.
  Neither var is on `development`, so local runs keep DCR enabled and need no
  client configuration.
  **A configured client still needs a `mcp_oauth_clients` row**, even though its
  identity and secret come from the environment: `mcp_auth_codes` and
  `mcp_refresh_tokens` both have a foreign key to `mcp_oauth_clients.clientId`, so
  minting a code for a row-less client fails with a foreign-key violation. That
  surfaces as a *crashed function*, not an OAuth error — the browser gets no
  response and shows a connection failure, which reads like a DNS or network
  problem and sends you looking in the wrong place. `authorize` therefore calls
  `ensureClientRow` (an idempotent upsert) before `createAuthCode`; the secret is
  never written to the row, it stays in the environment. The upsert matters beyond
  first-run setup because every preview deployment gets a fresh Neon branch with an
  empty table.
  `MCP_OAUTH_REDIRECT_URIS` is deliberately **unset**: with the list empty,
  `isAllowedRedirectUri` falls back to a host rule that accepts any redirect on
  `claude.ai` / `claude.com`, which survives Anthropic changing its callback path.
  Pin the variable only for a non-Anthropic client. PKCE (S256) is always required.

## Multi-User Data Isolation

All data access must be filtered by current user context.

Rules:

- Never query shared data without `userId` constraints when entity is user-owned
- Never accept a client-provided `userId` as source of truth
- Always derive user context from authenticated session

**Households (PLAN_MULTIUSER.md).** Since phase 1 of the multi-user plan, the
`userId` that scopes domain data is the **household owner's**, resolved by
`requireScope(level)` / `getScope()` in `lib/auth/scope.ts` (session →
`HouseholdMember` → `Household.ownerUserId`), not read straight off the
session. `Scope` distinguishes `dataUserId` (filters every domain query) from
`actorUserId` (the signed-in member — personal prefs, audit, OAuth grants).
Levels are `read`/`write`/`admin`, mapped to roles VIEWER/EDITOR/OWNER by the
pure matrix in `lib/auth/roles.ts` (tested). Every page/action under
`app/(app)` plus `api/banking/{connect,sync}` and `api/export` declares its
level; API routes use `getScope` + `roleAllows` to answer 401 vs 403. A guard
test (`lib/auth/scope-guard.test.ts`) fails the build if `session.user.id`
reappears in those areas.

Since phase 6-lite a user can belong to SEVERAL households (owning at most
one): the ACTIVE one comes from the `estalvify.hh` cookie — a preference
validated against the memberships on every request, never an access grant —
falling back to the oldest membership; the sidebar user menu switches it. A
signed-in user with NO membership is redirected by `getScope` to `/welcome`,
where household creation is an EXPLICIT choice (accept a pending invite,
create a named household, or just sign out) — nothing is ever created as a
sign-in side effect, because someone following an invite link may not want an
account at all. `/welcome`, login, the invite page and the OAuth consent flow
therefore use the session (or `lib/household/active.ts`) directly, never
`getScope`. MCP grants record the household active at consent and the token
endpoint re-validates that membership at every mint/refresh. Cron and the
queue consumer still derive identity from connections, unchanged.

## Privacy & data lifecycle (GDPR)

The self-service rights live in **Settings → Privacy & data**
(`components/settings/privacy-data-card.tsx`); the legal pages are `/privacy`
and `/terms` (`app/(legal)/`, public in `proxy.ts`, linked from the login
screen). Both pages are drafts pending legal review — the controller identity
placeholders must be filled before opening the app — and MUST stay in sync
with what the code actually does.

- **Export (portability)**: `GET /api/export` (session-authenticated) streams
  one JSON attachment built by `lib/account/export-user.ts` — everything the
  account owns, including the shared system categories its data references.
  Deliberate omission: `BankConnection.sessionId` (credential-adjacent).
- **Deletion (erasure)**: `deleteMyAccount` (settings action, typed-DELETE
  confirmation) → `lib/account/delete-user.ts`. Order matters: first revoke
  the PSD2 consents at Enable Banking (best effort — an EB outage must not
  block erasure; consents lapse within 90 days anyway), then delete rows.
  `onDelete: Cascade` covers most tables, but `transaction_categorizations`,
  `category_rules` and `budget_items` hold RESTRICT FKs into `categories`, so
  they are deleted explicitly first, in the same transaction as the user row.
- **Retention** (`lib/retention.ts`, filters pure + tested): the daily cron
  purges expired Auth.js sessions, expired MCP auth codes, expired/revoked
  refresh tokens (7-day debug grace), notifications (read > 90 days, unread >
  1 year) and stale rate-limit rows. Financial data is deliberately not
  auto-purged — it leaves via account deletion; an inactivity purge is a
  product decision.
- What deletion cannot reach: Vercel log retention and Neon branch/backup
  history age out on the providers' schedules. The privacy policy says so.

## Async Processing

Queue-based async processing is used for non-blocking workflows (for example sync jobs).

Rules:

- Keep UI responsive while jobs run in background
- Reflect processing state to users
- Ensure retries are safe and idempotent where possible

### Balances backfill with the transactions, not with the sync

Transactions and balances arrive from Enable Banking on completely different
terms, and confusing the two produced a real defect in production.

`/accounts/{id}/transactions` takes a date range, so a sync that runs after a
gap fetches everything it missed. `/accounts/{id}/balances` only ever answers
"what is the balance right now", so a balance row can only exist for a day the
sync actually ran. When a PSD2 consent expired and was not reconnected for
eight weeks, July's 112 transactions all landed later while July's balances
were lost for good — snapshots stop on 7 June and resume on 3 August.

That is not cosmetic. `buildMonthStatus` takes the last snapshot before the
month as the opening balance, so August opened on a **7 June** figure: the
month's "balance change" quietly became a two-month change carrying June's and
July's salaries, and the reconciliation check reported 7.544 € of unexplained
movement in a month where nothing was unexplained.

The fix is that every transaction can carry `balance_after_transaction`, the
bank's own running balance at that point. `lib/banking/daily-balances.ts`
records the last one of each day, so **balances now backfill with the
transactions**. Two things to keep in mind when touching this:

- The derived rows are written under `balanceType: "afterTransaction"` and
  **never override a day that already has an endpoint row** — they exist to
  fill days no sync ever covered, not to restate the days it did.
  `pickSnapshot` in `month-status.ts` enforces that preference; without it the
  two rows on one date made the read non-deterministic.
- Do **not** be tempted to derive the balance by adding up our own
  transactions instead. It would force the reconciliation gap to zero by
  construction and silently delete the check. The whole value of
  `balance_after_transaction` is that the number comes from the bank: if a
  transaction never reached us, the bank's running balance still moved by its
  amount and our sum did not — which is exactly what the check looks for.

**Measured 2026-08-07: BBVA sends the field as `null`.** The key name was
right; the bank does not fill it. So nothing is derived for that connection.

### Balances are anchored, not assumed

`lib/budget/balance-history.ts`. Because the history has holes, the balance at
a past date is not "the last row before it" — that reached back to **7 June**
for August's opening and invented 4.597 € of saving. Instead the NEAREST real
reading is picked and the ledger walks the short distance to the date wanted.

Deriving a balance from our own transactions is circular on its own: the
reconciliation check compares the balance change against those same
transactions, so it would report zero by construction and stop detecting
anything. **Anchoring is what removes the circularity** — the endpoints come
from the bank, only the interpolation is ours. And the anchors are checked
against each other: measured across the eight-week hole, 7 June to 7 August,
the two real readings differ by 4.405,18 € and 487 transactions explain
4.371,69 € of it. A 33,49 € residue over two months is what licenses the
interpolation.

So the reconciliation check did not disappear, it **moved**: from "does each
month's balance change match its flows", which needs a perfect daily history
PSD2 cannot promise, to `anchorGap` — "do two real bank readings agree with the
ledger between them", which survives an outage and still catches uncaptured
flow. It is judged against the gross flow of the window it spans, not the
month's, since that window can be two months wide.

Rules for anyone touching this:

- **A date is an anchor only when every active account has a reading on it.** A
  consolidated total assembled from a partial day is a fiction.
- **Transfers between the user's own accounts are included** in the walk. They
  net to zero across a consolidated total, and excluding them would open a hole
  whenever one leg is miscategorised.
- `balanceRank` decides which reading wins when a date holds several: `CLBD`
  first, other endpoint types next, `afterTransaction` last.

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

## A read path pays only for what it renders

Pages read live from Prisma, so the cost of a screen is whatever its builders
query — and two of the heaviest builders are shared by screens that need very
different slices of them. Both are therefore split, and a new caller picks the
narrow entry point unless it actually renders the wide one.

- **`lib/budget/month-status.ts`** exposes `buildMonthStatus` (everything) and
  `buildWeeklyStatus` (everything except the reconciliation block). The
  reconciliation alone costs five queries — the month's full flow list, the
  active accounts, 120 days of balance snapshots, a 120-day daily-flow rollup
  and the six-month cushion baseline — and the daily screen renders none of it.
  One implementation, one flag: nothing above the reconciliation depends on it,
  so `WeeklyStatus` is a plain subset and `MonthStatus extends WeeklyStatus`.
  The skipped queries are gated rather than left to return empty arrays,
  because a reconciliation computed over empty inputs is a fiction, not a zero.
- **`lib/planned/engine.ts`**'s `syncPlannedState` takes
  `{ refreshSchedule }`. Generation and matching are what the money numbers
  depend on; `refreshSeriesSchedule` re-derives `nextExpectedDate` /
  `lastSeenAt` by running every active series' matcher over eighteen months of
  the feed, and only Recurring shows those fields. Dashboard passes
  `refreshSchedule: false`; the nightly cron, Budget and Upcoming keep them
  fresh.

The other half of the same problem is *when* the work blocks the render. A page
whose header does not depend on the slow query renders the header immediately
and streams the body behind a `<Suspense>` boundary, with the route's
`loading.tsx` and the boundary's fallback sharing one skeleton component so
they cannot drift (`app/(app)/dashboard`, `app/(app)/plan`).

## Server to Client DTO Boundary

Do not pass ORM-rich objects directly to client components.

Rules:

- Use DTO mappers in `lib/**` for server -> client payloads.
- Convert non-serializable values (`Date`, `Decimal`, class instances) to plain values.
- Keep DTOs stable and reusable across desktop/mobile views for the same feature.
