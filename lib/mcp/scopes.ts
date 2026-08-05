// MCP OAuth scopes — pure helpers shared by the authorize/consent flow, the
// token verifier and the tool registry.
//
// Two scopes cover the API's real permission boundary: `read` (list/query
// financial data) and `write` (categorize, manage categories/rules/plan,
// trigger bank syncs). Finer granularity would be theater — every tool is
// already scoped to the token's user; read vs write is the split a user can
// meaningfully decide on a consent screen.

export const KNOWN_SCOPES = ["read", "write"] as const;
export type KnownScope = (typeof KNOWN_SCOPES)[number];

/** What each scope means, in consent-screen language. */
export const SCOPE_DESCRIPTIONS: Record<KnownScope, string> = {
  read: "Read your accounts, transactions, categories, rules and plan",
  write:
    "Categorize transactions, manage categories, rules and plan items, and trigger bank syncs",
};

export const FULL_SCOPE = KNOWN_SCOPES.join(" ");

/**
 * Normalize the scope string a client requested into the scopes that will be
 * granted: unknown scopes are dropped (RFC 6749 lets the server narrow), and
 * an absent/empty request means full access — MCP clients typically request
 * no scope at all, and a default of "nothing" would break every connector.
 * Deduplicated, in canonical order.
 */
export function normalizeRequestedScope(raw: string | null | undefined): string {
  const requested = (raw ?? "")
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (requested.length === 0) return FULL_SCOPE;
  const granted = KNOWN_SCOPES.filter((s) => requested.includes(s));
  return granted.length > 0 ? granted.join(" ") : FULL_SCOPE;
}

/**
 * Scopes carried by a token claim. A token with NO scope claim predates scope
 * enforcement (or was minted from a legacy refresh token) and keeps full
 * access — those tokens expire within the hour, and refusing them would break
 * a working connector on deploy.
 */
export function scopesFromClaim(claim: string | null | undefined): string[] {
  const scopes = (claim ?? "")
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return scopes.length > 0 ? scopes : [...KNOWN_SCOPES];
}

/** Does a granted scope list authorize an operation needing `needed`? */
export function hasScope(granted: string[], needed: KnownScope): boolean {
  return granted.includes(needed);
}
