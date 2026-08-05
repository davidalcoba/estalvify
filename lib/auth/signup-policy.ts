// Signup policy — whether sign-in may auto-provision a new User row.
//
// Auth.js with the Prisma adapter CREATES the user on first sign-in: login and
// registration are the same door. ALLOWED_EMAILS narrows who fits through it,
// but "allowed to log in" and "allowed to become a user" are different
// decisions, and for a closed deployment the second one should default to NO:
// sign-in only matches users that already exist in the database.
//
// ALLOW_SIGNUP opts back into auto-provisioning. Its one legitimate use is
// bootstrap — the first login against a fresh database (local dev, a new Neon
// branch) has no row to match — and it should be turned off afterwards.
//
// Pure so the parsing is unit-testable; auth.ts reads the env var and
// delegates here.

const TRUTHY = new Set(["true", "1", "yes", "on"]);

/** Only an explicit, well-known truthy value opens signup; everything else —
 *  unset, empty, "false", a typo — stays closed. Fail closed, like the
 *  allowlist. */
export function isSignupAllowed(raw: string | null | undefined): boolean {
  if (!raw) return false;
  return TRUTHY.has(raw.trim().toLowerCase());
}
