# Coding Rules

## TypeScript and Safety

- Keep strict TypeScript standards
- Avoid `any`; if unavoidable, add a short justification comment
- Prefer explicit domain types for statuses and payloads

## Server and Client Boundaries

- Use server components by default
- Add `"use client"` only when interactivity requires it
- Keep client components focused on interaction and presentation

## Data Access

- Always scope user-owned entities to authenticated user context
- Validate external inputs and API payloads
- Avoid leaking sensitive banking details in logs or errors

## Async and Reliability

- Long-running work should be queue-backed
- Reflect pending/syncing states in UI
- Design mutations and jobs to be retry-safe when feasible

## Maintainability

- Keep functions focused and small
- Use clear names for domain concepts
- Prefer extending existing patterns over introducing competing ones
- Do not modify unrelated files in a feature change

## Platform Preference

- Assume Vercel as the target platform for implementation decisions.
- When feasible, use Vercel built-in capabilities before introducing third-party or custom infrastructure.
- If a non-Vercel solution is chosen, document the reason briefly in the PR/commit notes.

## Comments

- Use concise comments for non-obvious intent
- Do not add comments that restate obvious code
