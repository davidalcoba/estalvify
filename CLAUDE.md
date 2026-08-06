# AI Instructions Index

This file is an index. Use `ai-instructions/` as the source of truth.

## Commands

- `npm run dev` — start the dev server
- `npm run build` — production build (runs migrations + `prisma generate` first)
- `npm run lint` — ESLint
- `npm run typecheck` — `tsc --noEmit`
- `npm run test` — Vitest unit tests

Run `npm run typecheck && npm run lint && npm run test` before finishing any change.

## Deployment & preview URLs (Vercel)

This project deploys on **Vercel** — project `estalvify`
(`projectId: prj_MwnNS5SFs4qNiRu6G6DFfrzYbYjI`), production at
`https://estalvify.vercel.app`. Every push to a branch produces a preview
deployment; merges to `main` deploy to production.

**Release path: feature branch → `preview` → `main`.** `main` is production and is
reached only through `preview`, which has a fixed URL —
`https://estalvify-preview.vercel.app` (a project domain pinned to the `preview`
git branch, so it always serves that branch's newest deployment) — and its own
Neon branch. Two workflows hold the path together: `release-gate.yml` fails a pull
request into `main` whose head is not `preview`, and `sync-preview.yml`
fast-forwards `preview` to `main` after each release so it cannot drift behind
(the merge commit on `main` would otherwise leave it permanently one commit
back), after checking that what landed on `main` actually came through `preview`
(it fails the release otherwise, since a direct push fast-forwards `preview`
cleanly and would otherwise pass unnoticed).

Neither workflow can *prevent* a direct push to `main` — Actions run after the
push. **That part is a GitHub ruleset, and it is applied**: "main: solo desde
preview" (id `20327850`, `enforcement: active`) targets the default branch and
requires a pull request (0 approvals) plus both checks —
`A PR into main must come from preview` and `Typecheck · Lint · Test` — with
force pushes and deletion blocked. So a direct push to `main` is now rejected by
GitHub, not merely reported after the fact. Confirm it any time with

```bash
curl -s -H "Authorization: Bearer $GITHUB_TOKEN" \
  https://api.github.com/repos/davidalcoba/estalvify/rules/branches/main
```

which answers with the rules in force on that ref (an empty array means the lock
is gone). A Claude Code session **cannot create or edit it** — writes to GitHub's
administration API paths are refused at the sandbox proxy (`POST
/repos/{repo}/rulesets` → 403 "Write access to this GitHub API path is not
permitted through this proxy") and the session token reports `admin: false` — so
changes go through the GitHub UI (Settings → Rules) or a personal token, using
the payload kept at `.github/rulesets/main-release-path.json`.

The two required contexts are the workflows' **job names**. Renaming a job
without updating the ruleset leaves `main` unmergeable, waiting for a check that
never reports.

So: never open or merge a pull request into `main` from a feature branch, and
merge into `preview` first.

### When the release is blocked by a cancelled check

`ci.yml` runs on **both** the push to `preview` and the pull request into
`main`, and both produce a job named `Typecheck · Lint · Test`. The ruleset
requires that *context*, and when several check runs share a name GitHub can
settle on the wrong one: observed 2026-08-06, `main` refused the merge with
`Required status check "Typecheck · Lint · Test" is cancelled` while the pull
request's own run was green — it was reading the **push** run on `preview`,
which GitHub itself had cancelled after 15 minutes without ever assigning a
runner (job `cancelled`, zero steps executed, no log to download; a second
attempt died in `Set up job` before checkout). Nothing to do with the code:
the same tree had already passed CI on the feature branch, and `git rev-parse
<sha>^{tree}` proved the trees identical.

Recovery, knowing that a Claude Code session **cannot** re-run a workflow
(`POST /actions/runs/{id}/rerun` and `/rerun-failed-jobs` → 403 "Resource not
accessible by integration", through the GitHub MCP server as well as plain
`curl`):

- **A new commit on the branch is the only reliable re-trigger.** It fires
  `synchronize`, and — because the checks hang off the head SHA — it also
  leaves the pull request with exactly *one* run per context instead of a
  pile of same-named ones for the ruleset to choose badly from.
- Closing and reopening the pull request re-fires its `pull_request`
  workflows (both listen to the default types, `reopened` included), but it
  is **not dependable**: it worked three times that day and then stopped
  producing a run at all. Use it only as a no-commit first try.
- Neither re-fires the `push` run on `preview`. That one only comes back with
  a new commit on `preview`, so the fix is a further feature-branch →
  `preview` pull request, never a direct push.

Before assuming a red release means broken code, **read the failed job's
log** — `get_job_logs` with `failed_only: true` returns content even for a
run whose log archive 404s, and it is what actually names the outage. Two
signatures seen that day, both infrastructure:

- `conclusion: cancelled` with an empty `steps` array and no `runner_name` —
  GitHub gave up placing the job after ~15 min.
- A runner picked the job up and died in `Set up job` with
  `Failed to resolve action download info. Error: Service Unavailable`
  (twice retried, then fatal). The action-resolution service was down; the
  workflow never reached `Checkout`. Waiting it out and re-triggering is the
  whole fix — there is nothing to change in the repo.

A Vercel API token is provided as the `VERCEL_TOKEN` environment variable in the
Claude Code environment (it is a secret — never commit it or print its value).
Use it against the Vercel REST API at `https://api.vercel.com`.

**It is not read-only.** It has write access to this project's configuration: it
has been used to create env vars (`DIRECT_URL` on `production` and
`development`), `PATCH` the targets of 17 of them, and delete 15. Treat writes as
real and confirm before making them. Its limits are elsewhere — some
Marketplace/storage endpoints refuse it (`GET /v1/storage/stores` → 403,
`GET /v1/storage/stores/{id}` → 404), so a failure there is not evidence of the
token being read-scoped. And a missing secret is usually a missing *value*, not a
missing permission: `ANTHROPIC_API_KEY` is unset because nobody has supplied the
key, and no token scope changes that.

**After pushing commits to a branch or opening a PR, report the resulting Vercel
preview URL to the user.** Look it up from the API instead of guessing — the
deploy is async, so it may still be building right after the push:

```bash
curl -s -H "Authorization: Bearer $VERCEL_TOKEN" \
  "https://api.vercel.com/v6/deployments?projectId=prj_MwnNS5SFs4qNiRu6G6DFfrzYbYjI&target=preview&limit=20"
```

Pick the newest deployment whose `meta.githubCommitRef` matches the branch (or
whose `meta.githubCommitSha` matches the pushed commit) and give the user
`https://<url>` plus its `state` (`READY` / `BUILDING` / `ERROR`); if it is still
`BUILDING`, say so and offer to re-check.

For the `preview` branch, hand over the fixed `https://estalvify-preview.vercel.app`
rather than the per-deployment hash URL — same deployment, stable link — but still
look up the deployment's `state` so you report whether that URL is already serving
the new commit. The hash URLs are the ones to report for feature branches.

### Opening a protected URL yourself

Vercel Authentication is on (`ssoProtection: prod_deployment_urls_and_all_previews`),
so **a human** opening a preview link needs a team login — mention that when you
hand over a URL. You do not: the project has a Protection Bypass for Automation,
and the secret is the *key* of the `protectionBypass` map returned by
`GET /v9/projects/{id}`, so it needs nothing passed in.

```bash
BYPASS=$(curl -s -H "Authorization: Bearer $VERCEL_TOKEN" \
  "https://api.vercel.com/v9/projects/prj_MwnNS5SFs4qNiRu6G6DFfrzYbYjI?teamId=team_qo5V9Jw7mrPRQUOl9TjhJGIi" \
  | python3 -c "import json,sys; print(next(iter(json.load(sys.stdin)['protectionBypass'])))")
curl -sL -H "x-vercel-protection-bypass: $BYPASS" https://estalvify-preview.vercel.app
```

It is a secret: never print it or commit it. Verified behaviour — without the
header a preview answers `302` to `vercel.com/sso-api?url=…&nonce=…` (the SSO
wall, not a `401`); with it you get the app, `307` to `/login` for an
unauthenticated request. The production alias `estalvify.vercel.app` needs no
header at all: that protection setting covers deployment URLs and previews, not
the production domain.

Network policy note — this part is **not** stable, so test it, do not trust this
paragraph. The egress allowlist belongs to the Claude Code environment, not to the
repo, and it is fixed when the container starts: a host the owner unblocks
mid-session may only work in the next one. As last observed (2026-08-03, second
session), `*.vercel.app`, `api.vercel.com`, `console.neon.tech`, `api.github.com`,
plus the newly added `vercel.com`, `neon.com` and `registry.npmjs.org` all
answered `200`. With `registry.npmjs.org` reachable, `npm ci` works and the gate
**does** run locally — no need to bounce off CI for it.

One host is still blocked and it bites: `binaries.prisma.sh` fails at the proxy
`CONNECT` with `403`, so `npx prisma generate` cannot fetch its schema engine.
Left unfixed the generate aborts, `app/generated/prisma` is never written, and
`npm run typecheck` then reports ~20 phantom errors (`TS2307` on
`@/app/generated/prisma`, plus a cascade of `TS7006` implicit-`any`) that have
nothing to do with the code. The engine is not actually needed to generate the
client — the CLI only checks that it is present — so point
`PRISMA_SCHEMA_ENGINE_BINARY` at any executable stub and generate succeeds:

```bash
printf '#!/bin/sh\nexit 0\n' > /tmp/schema-engine && chmod +x /tmp/schema-engine
PRISMA_SCHEMA_ENGINE_BINARY=/tmp/schema-engine npx prisma generate
```

`PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1` is **not** enough on its own — it only
skips the `.sha256` fetch, then the `.gz` download fails on the same blocked host.
The stub is fine for `generate`/`typecheck`/`lint`/`test`; anything that really
drives the schema engine (`prisma migrate`) still needs the host unblocked.

A trap when shortening the gate's output, which has already produced one false
"gate passed": run the commands as written above. If you pipe a step into `tail`
to trim its output, the pipeline returns `tail`'s status, not the step's, so
`npm run typecheck | tail` reports success over a failing typecheck. Redirect to
a file and check `$?` instead.

## Databases (Neon)

Each deployment target has its own Neon branch: production → Neon `main`, the
`preview` branch → Neon `preview`, feature branches → an ephemeral
`preview/<git-branch>` created by the Neon–Vercel integration. **Never point a
preview at the production database.** See
`ai-instructions/context/ARCHITECTURE.md` → "Databases (Neon)" for the branch
map, the Vercel env var layout, and why there is no generic `DIRECT_URL`.

A Neon API key is provided as `NEON_DB_KEY` (secret — never commit it or print
its value). `console.neon.tech` is reachable; the org id
(`org-autumn-pond-35905682`) is a required query param on most endpoints. Direct
Postgres (port 5432) is blocked by the network policy — query a branch through
Neon's SQL-over-HTTP endpoint instead.

## Keep these docs up to date

The docs under `ai-instructions/context/` are the source of truth and MUST stay
accurate. Any change that affects architecture, the stack, UI conventions, feature
status, or configuration MUST update the relevant doc (and `.env.example` for new env
vars) **in the same change** — never leave the docs describing a state the code no
longer matches.

## Keep route skeletons in sync

Every route under `app/(app)` has a `loading.tsx` skeleton. It is part of the
page's design: **changing a page's layout MUST update that route's `loading.tsx`
in the same change**, and a new route ships one from the start. Build them from
`components/layout/skeletons`. See `ai-instructions/context/UI_RULES.md` →
"Navigation Feedback".

## Context
- `./ai-instructions/context/README.md`
- `./ai-instructions/context/PROJECT_OVERVIEW.md`
- `./ai-instructions/context/ARCHITECTURE.md`
- `./ai-instructions/context/UI_RULES.md`
- `./ai-instructions/context/CODING_RULES.md`
- `./ai-instructions/context/PLAYBOOK_NEW_FEATURE.md`
- `./ai-instructions/context/GLOSSARY.md`
- `./ai-instructions/context/ROADMAP.md`
- `./ai-instructions/context/AUDIT.md`

## Skills
- `./ai-instructions/skills/frontend-design/SKILL.md`
