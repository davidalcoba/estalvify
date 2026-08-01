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
`BUILDING`, say so and offer to re-check. Preview URLs are behind Vercel
Authentication, so mention that a team login may be required to open them.

## Keep these docs up to date

The docs under `ai-instructions/context/` are the source of truth and MUST stay
accurate. Any change that affects architecture, the stack, UI conventions, feature
status, or configuration MUST update the relevant doc (and `.env.example` for new env
vars) **in the same change** — never leave the docs describing a state the code no
longer matches.

## Context
- `./ai-instructions/context/README.md`
- `./ai-instructions/context/PROJECT_OVERVIEW.md`
- `./ai-instructions/context/ARCHITECTURE.md`
- `./ai-instructions/context/UI_RULES.md`
- `./ai-instructions/context/CODING_RULES.md`
- `./ai-instructions/context/PLAYBOOK_NEW_FEATURE.md`
- `./ai-instructions/context/GLOSSARY.md`

## Skills
- `./ai-instructions/skills/frontend-design/SKILL.md`
