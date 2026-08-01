# AI Instructions Index

This file is an index. Use `ai-instructions/` as the source of truth.

## Commands

- `npm run dev` — start the dev server
- `npm run build` — production build (runs migrations + `prisma generate` first)
- `npm run lint` — ESLint
- `npm run typecheck` — `tsc --noEmit`
- `npm run test` — Vitest unit tests

Run `npm run typecheck && npm run lint && npm run test` before finishing any change.

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
