# AI Context Docs

This folder is the source of truth for AI coding assistants working in this repository.

Read these files in order:

1. `PROJECT_OVERVIEW.md`: Product scope, business goals, platform stack, and multi-user model.
2. `ARCHITECTURE.md`: Codebase structure, layer responsibilities, data isolation, and async processing boundaries.
3. `UI_RULES.md`: UI constraints and design system rules, including desktop/mobile dual presentation guidance.
4. `CODING_RULES.md`: Engineering standards for TypeScript, server/client boundaries, data safety, and maintainability.
5. `PLAYBOOK_NEW_FEATURE.md`: Execution checklist for implementing features safely and consistently.
6. `GLOSSARY.md`: Shared domain terminology for product, banking, categorization, budgets, and operations.
7. `ROADMAP.md`: Product roadmap and phased delivery plan for upcoming features (budgets, recurring expenses, forecasting, reports, notifications, AI recommendations). Read it to pick up the next phase to build; update the phase checklist in the same change.
8. `AUDIT.md`: Dated codebase audit (design, architecture, coherence, security). A prioritized improvement roadmap grouped by bucket — A (fix now, even single-user), B (gating before opening to the internet / multi-user), C (architecture/data/tests), D (code & UI coherence). A snapshot, not a source-of-truth spec; re-audit or supersede rather than editing in place.

All documents in this folder must be consistent with each other.

Platform baseline:
- This app is deployed on Vercel.
- For feature implementation, prefer Vercel built-in capabilities whenever they fit and there is no stronger alternative.

These docs and the root `README.md` must be kept up to date as part of every relevant codebase change. When behavior, architecture, rules, or terminology change, update the corresponding documentation in the same PR/commit.
