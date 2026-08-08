# AI Instructions Index

This file is an index. Use `ai-instructions/` as the source of truth.

## Context

Start at [`../ai-instructions/context/README.md`](../ai-instructions/context/README.md).
It is the canonical index of the context docs — it lists every one of them, in
reading order, with what each covers, and it is the only place that list is
maintained. Read it first and follow it from there.

The essentials it will point you at: `PROJECT_OVERVIEW.md` (product and stack),
`ARCHITECTURE.md` (structure, deployment, data isolation), `UI_RULES.md` and
`CODING_RULES.md` (the rules to follow when writing code), and
`PLAYBOOK_NEW_FEATURE.md` (the checklist for shipping a change).

## Design guidance

The project's frontend design rules are packaged as a Claude Code skill at
[`../.claude/skills/frontend-design/SKILL.md`](../.claude/skills/frontend-design/SKILL.md).
Claude Code loads it automatically; other assistants should read it as a document
when touching the UI. It operates inside `ai-instructions/context/UI_RULES.md`,
which remains the source of truth.

## Keeping docs current

Any change that affects architecture, the stack, UI conventions, feature status,
or configuration must update the relevant doc under `ai-instructions/context/`
(and `.env.example` for new env vars) in the same change.
