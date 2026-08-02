# AI Instructions Index

This file is an index. Use `ai-instructions/` as the source of truth.

## Commands

- `npm run dev` — start the dev server
- `npm run build` — production build (runs migrations + `prisma generate` first)
- `npm run lint` — ESLint
- `npm run typecheck` — `tsc --noEmit`
- `npm run test` — Vitest unit tests

Run `npm run typecheck && npm run lint && npm run test` before finishing any change.

## Branching model

Three tiers — never push straight to `main` or `preview`:

| Branch | Vercel environment | URL |
| --- | --- | --- |
| `main` | Production | `https://estalvify.vercel.app` |
| `preview` | Preview (integration) | `https://estalvify-preview.vercel.app` (fixed) |
| feature branches | Preview (per-branch) | `https://estalvify-git-<branch>-davids-projects-5e7f6837.vercel.app` |

- **Feature branches always target `preview`.** Open the PR with
  `--base preview`; `preview` is the repo's default branch so this is also the
  default.
- **Only `preview` may open a PR into `main`.** That release PR is what promotes
  to production. The `Base branch policy` job in `.github/workflows/ci.yml`
  fails any other PR that targets `main`.
- `preview` is long-lived and never deleted. After a release merges to `main`
  the two branches are identical, so `preview` needs no reset.

## Deployment & preview URLs (Vercel)

This project deploys on **Vercel** — project `estalvify`
(`projectId: prj_MwnNS5SFs4qNiRu6G6DFfrzYbYjI`), production at
`https://estalvify.vercel.app`. Every push to a branch produces a preview
deployment; merges to `main` deploy to production.

The `preview` branch additionally has a **fixed alias**,
`https://estalvify-preview.vercel.app`, registered as a branch-assigned domain
so it always points at the latest `preview` deployment. Its
`NEXT_PUBLIC_APP_URL` is branch-scoped to that URL. `AUTH_REDIRECT_PROXY_URL`
and `ENABLE_BANKING_REDIRECT_URI` intentionally stay on the production URL on
every environment — they must match redirect URIs registered with Google and
Enable Banking.

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

For the `preview` branch just give `https://estalvify-preview.vercel.app` — it is
stable — but still check the deployment `state` before saying it is live.
Otherwise pick the newest deployment whose `meta.githubCommitRef` matches the branch (or
whose `meta.githubCommitSha` matches the pushed commit) and give the user
`https://<url>` plus its `state` (`READY` / `BUILDING` / `ERROR`); if it is still
`BUILDING`, say so and offer to re-check. Preview URLs are behind Vercel
Authentication, so mention that a team login may be required to open them.

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
