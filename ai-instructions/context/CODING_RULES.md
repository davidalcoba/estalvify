# Coding Rules

## TypeScript and Safety

- Keep strict TypeScript standards
- Avoid `any`; if unavoidable, add a short justification comment
- Prefer explicit domain types for statuses and payloads

## Server and Client Boundaries

- Use server components by default
- Add `"use client"` only when interactivity requires it
- Keep client components focused on interaction and presentation
- At server -> client boundaries, pass DTOs/plain objects only (no `Date`/`Decimal`/class instances)

## Data Access

- Always scope user-owned entities to authenticated user context
- Validate external inputs and API payloads
- Avoid leaking sensitive banking details in logs or errors
- When sending data to external AI providers, send only anonymized aggregates (amounts + category names) — never IBANs, raw transaction descriptions, or merchant names. AI provider keys are server-side only and must never reach the client (see `lib/ai/`).

## Async and Reliability

- Long-running work should be queue-backed
- Reflect pending/syncing states in UI
- Design mutations and jobs to be retry-safe when feasible

## Maintainability

- Keep functions focused and small
- Use clear names for domain concepts
- Prefer extending existing patterns over introducing competing ones
- Do not modify unrelated files in a feature change
- Render money/dates via `lib/formatters` (`formatCurrency`/`formatDate`), never ad-hoc

## User-Facing Strings

- Never hardcode text a person reads. Look it up from the dictionaries —
  `await getT()` on the server, `useT()` on the client. See UI_RULES.md →
  "Every visible string comes from the dictionaries" and ARCHITECTURE.md →
  "Internationalization".
- Pure modules stay pure: they take a `Translator` as a parameter (as
  `lib/notifications/generators.ts` does) rather than importing one.
- A domain failure the user will read is thrown as
  `new AppError("<message.key>")` (`lib/errors.ts`); the server action renders
  it with `describeError(err, await getT())`. Do not throw sentences.
- Copy that is PERSISTED (notifications) is written in the household OWNER's
  language, because one row is shared by every member. Copy that is RENDERED
  follows the acting member's.

## Testing and Checks

- Pure logic (parsers, classifiers, query/where builders, formatters) should have
  Vitest unit tests next to it (`lib/**/*.test.ts`). Extract logic to a pure module
  when that makes it testable without the DB/network.
- Before finishing: run `npm run typecheck && npm run lint && npm run test`.
- CI (`.github/workflows/ci.yml`) enforces the same gate on every PR.

## Platform Preference

- Assume Vercel as the target platform for implementation decisions.
- When feasible, use Vercel built-in capabilities before introducing third-party or custom infrastructure.
- If a non-Vercel solution is chosen, document the reason briefly in the PR/commit notes.

## Comments

- Use concise comments for non-obvious intent
- Do not add comments that restate obvious code
