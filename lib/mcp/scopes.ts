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

// What each scope means in consent-screen language now lives in the
// dictionaries as `mcp.scope.read` / `mcp.scope.write`: the consent screen is
// rendered in the member's language, and this module is pure — it must not
// reach for a translator.

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
 * Scopes carried by a token claim, for enforcement. Only recognized scopes
 * count; a claim that carries NONE of them keeps full access. That covers two
 * cases that must not lock out a working connector:
 *   - no scope claim at all (token predates scope enforcement), and
 *   - a legacy/opaque scope value the client sent before we modelled scopes
 *     (e.g. "mcp") that an old authorize flow stored verbatim and refresh-token
 *     rotation carries forward.
 * It mirrors normalizeRequestedScope, so an unknown scope means "full", never
 * "nothing" — a token that could do nothing is worse than the pre-scope status
 * quo. A claim that DOES name a known scope (e.g. "read") is honored exactly,
 * so a genuine read-only grant still can't write.
 */
export function scopesFromClaim(claim: string | null | undefined): string[] {
  const requested = (claim ?? "")
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const known = KNOWN_SCOPES.filter((s) => requested.includes(s));
  return known.length > 0 ? known : [...KNOWN_SCOPES];
}

/** Does a granted scope list authorize an operation needing `needed`? */
export function hasScope(granted: string[], needed: KnownScope): boolean {
  return granted.includes(needed);
}

/**
 * Intersect granted scopes with the member's household role
 * (PLAN_MULTIUSER.md phase 4): a VIEWER's token is read-only no matter what
 * was requested or consented — the role is the ceiling, the scope the floor
 * below it. Returning exactly ["read"] (never []) matters twice over: an
 * empty list would round-trip through scopesFromClaim as FULL access, and a
 * viewer can read everything in-app anyway. Applied at mint time (token
 * endpoint) and again at verify time (belt and braces for legacy tokens).
 */
export function scopesForRole(
  scopes: string[],
  role: "OWNER" | "EDITOR" | "VIEWER",
): string[] {
  return role === "VIEWER" ? ["read"] : scopes;
}
