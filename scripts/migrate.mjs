#!/usr/bin/env node
// Runs `prisma migrate deploy` with automatic retry.
// Neon serverless databases cold-start in a few seconds; the first
// attempt often times out (P1002) before the server is ready.
// Three attempts with 10-second back-off is enough in practice.

import { execSync } from "child_process";

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = 10_000;

// Which database is this build about to migrate? Prisma prints the full host,
// but Vercel redacts it in build logs because it matches an env var value.
// The first DNS label is the Neon endpoint id (e.g. `ep-wild-bonus-alkflucu`,
// `-pooler` suffixed when pooled). It identifies the Neon branch, is not a
// credential, and — unlike the full host — is not an exact match of any env
// value, so it survives redaction. Without it there is no way to tell from a
// build log whether a preview deployment migrated its own branch or production.
function migrationTarget() {
  const direct = process.env.DIRECT_URL;
  const raw = direct ?? process.env.DATABASE_URL;
  if (!raw) return "no DATABASE_URL/DIRECT_URL set";
  try {
    const endpoint = new URL(raw).hostname.split(".")[0];
    return `${endpoint} (via ${direct ? "DIRECT_URL" : "DATABASE_URL"})`;
  } catch {
    return `unparseable ${direct ? "DIRECT_URL" : "DATABASE_URL"}`;
  }
}

console.log(`[migrate] target: ${migrationTarget()}`);

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  try {
    execSync("prisma migrate deploy", { stdio: "inherit" });
    process.exit(0);
  } catch (err) {
    const isLast = attempt === MAX_ATTEMPTS;
    if (isLast) {
      console.error(`Migration failed after ${MAX_ATTEMPTS} attempts.`);
      process.exit(1);
    }
    console.warn(
      `[migrate] Attempt ${attempt}/${MAX_ATTEMPTS} failed — retrying in ${BACKOFF_MS / 1000}s…`
    );
    await new Promise((resolve) => setTimeout(resolve, BACKOFF_MS));
  }
}
