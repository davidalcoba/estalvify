#!/usr/bin/env node
// Runs `prisma migrate deploy` with automatic retry.
// Neon serverless databases cold-start in a few seconds; the first
// attempt often times out (P1002) before the server is ready.
// Three attempts with 10-second back-off is enough in practice.

import { execSync } from "child_process";

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = 10_000;

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
