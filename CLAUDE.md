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

A read-scoped Vercel API token is provided as the `VERCEL_TOKEN` environment
variable in the Claude Code environment (it is a secret — never commit it or
print its value). Use it against the Vercel REST API at `https://api.vercel.com`.

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
mid-session may only work in the next one. As last observed (2026-08-03),
`*.vercel.app`, `api.vercel.com`, `console.neon.tech` and `api.github.com` were
reachable, while `vercel.com`, `neon.com` and `registry.npmjs.org` were not. That
last one matters: with it blocked `npm ci` fails, so
`npm run typecheck && npm run lint && npm run test` can only run in CI — push and
read the check result off the PR rather than claiming the gate passed locally.

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

## Skills
- `./ai-instructions/skills/frontend-design/SKILL.md`
