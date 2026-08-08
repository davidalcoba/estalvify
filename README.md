# Estalvify

Personal finance management app with bank connections, transaction sync, categorization, budgets, and reports.

## AI Assistant Context

For AI coding assistants (Codex, Claude, Copilot), use the context docs in:

- `ai-instructions/context/README.md`

These files define architecture, UI constraints, multi-user rules, and desktop/mobile expectations.
They also define a Vercel-first implementation policy: deploy on Vercel and prefer Vercel built-in features when feasible.

`ai-instructions/` is shared by every assistant. `.claude/` holds only what is
specific to Claude Code and must sit where the tool looks for it: `settings.json`,
`hooks/`, and the `skills/` it auto-discovers.

## Environment variables

`.env.example` documents every variable the app reads (database, Auth.js/Google,
Enable Banking, cron).

### Setting up a local machine

Pull the `development` values from Vercel into `.env`, **not** into `.env.local`:

```bash
vercel env pull .env
```

Next.js loads `.env.local` at a higher priority than `.env`, so keeping the two
apart means anything you set by hand survives the next `vercel env pull` instead
of being overwritten by it. Both are gitignored.

Put in `.env.local`:

- **`ENABLE_BANKING_PRIVATE_KEY`** — only needed to run real bank syncs locally.
  It is deliberately not on Vercel's `development` target: it is the RS256 key
  that signs PSD2 requests, and `vercel env pull` should not drop it on a laptop
  by default. Copy it by hand when you actually need it.
- **`CRON_SECRET`** — same reasoning; only needed to call `/api/cron/sync` by hand.
- **`AUTH_SECRET`** — optional. The pulled value is production's; generating a
  local one (`openssl rand -base64 32`) keeps local sessions independent.

What the pull gives you is already correct: `DATABASE_URL` / `DIRECT_URL` point at
the Neon `development` branch, never production (see
`ai-instructions/context/ARCHITECTURE.md` → "Databases (Neon)").

One caveat not yet verified on a real laptop: `AUTH_REDIRECT_PROXY_URL` is set on
`development` too and points at the production `/api/auth`. If Google sign-in
misbehaves locally, that is the first thing to override or unset in `.env.local`.

`ENABLE_BANKING_REDIRECT_URI` must exactly match a redirect URI registered in the
Enable Banking app config, and should be set on all Vercel environments.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Learn More

To learn more about Next.js, take a look at these resources:

- [Next.js Documentation](https://nextjs.org/docs)
- [Learn Next.js](https://nextjs.org/learn)

## Deploy on Vercel

The easiest way to deploy your Next.js app is the [Vercel Platform](https://vercel.com/new).
