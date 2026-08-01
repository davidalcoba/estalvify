// OAuth 2.1 primitives for the MCP Authorization Server.
//
// This module is intentionally storage- and framework-agnostic: pure crypto
// (PKCE, opaque token generation/hashing) plus JWT access-token issuing and
// verification via `jose`. The DB (auth codes, refresh tokens, clients) and the
// HTTP endpoints live elsewhere and build on these helpers.
//
// Access tokens are self-contained JWTs (HS256) so the MCP route can verify them
// statelessly. Authorization codes and refresh tokens are opaque random strings;
// only their SHA-256 hash is stored, never the raw value.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

// ── Config ──────────────────────────────────────────────────────────────────

/** Secret used to sign MCP access tokens. Falls back to AUTH_SECRET so we don't
 *  introduce a second required secret for the personal/MVP setup. */
function getJwtSecret(): Uint8Array {
  const secret = process.env.MCP_JWT_SECRET ?? process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "MCP_JWT_SECRET (or AUTH_SECRET) must be set to sign MCP access tokens",
    );
  }
  return new TextEncoder().encode(secret);
}

/** Audience claim identifying the MCP resource these tokens are valid for. */
export const MCP_AUDIENCE = "estalvify-mcp";

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour
export const AUTH_CODE_TTL_SECONDS = 60; // 1 minute
export const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

// ── Opaque tokens (auth codes, refresh tokens) ────────────────────────────────

/** Cryptographically-random URL-safe token. */
export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** SHA-256 hex hash — store this, never the raw token. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Constant-time comparison of a presented token against a stored hash. */
export function verifyTokenHash(presented: string, storedHash: string): boolean {
  const a = Buffer.from(hashToken(presented), "hex");
  const b = Buffer.from(storedHash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ── PKCE (RFC 7636) ───────────────────────────────────────────────────────────

/** Compute the S256 code challenge for a given verifier: base64url(sha256(v)). */
export function computeS256Challenge(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier).digest("base64url");
}

/**
 * Verify a PKCE code_verifier against the stored code_challenge.
 * Only the S256 method is supported (plain is disallowed by OAuth 2.1 for
 * public clients). Comparison is constant-time.
 */
export function verifyPkce(
  codeVerifier: string,
  codeChallenge: string,
  method: string = "S256",
): boolean {
  if (method !== "S256") return false;
  if (!codeVerifier || !codeChallenge) return false;
  // RFC 7636: verifier is 43–128 chars from the unreserved set.
  if (codeVerifier.length < 43 || codeVerifier.length > 128) return false;
  const expected = Buffer.from(computeS256Challenge(codeVerifier));
  const actual = Buffer.from(codeChallenge);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

// ── Access tokens (JWT, HS256) ────────────────────────────────────────────────

export interface AccessTokenClaims {
  /** Estalvify user id (Auth.js User.id). */
  userId: string;
  /** OAuth client that the token was issued to. */
  clientId: string;
  /** Space-delimited scopes, if any. */
  scope?: string;
}

/** Issue a signed access token for the given user/client. */
export async function signAccessToken(
  claims: AccessTokenClaims,
  ttlSeconds: number = ACCESS_TOKEN_TTL_SECONDS,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ scope: claims.scope, client_id: claims.clientId })
    .setProtectedHeader({ alg: "HS256", typ: "at+jwt" })
    .setSubject(claims.userId)
    .setAudience(MCP_AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(getJwtSecret());
}

/**
 * Verify an access token and return its claims, or null if invalid/expired.
 * Never throws — callers treat null as "unauthenticated".
 */
export async function verifyAccessToken(
  token: string,
): Promise<AccessTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), {
      audience: MCP_AUDIENCE,
    });
    const p = payload as JWTPayload & { scope?: string; client_id?: string };
    if (!p.sub || !p.client_id) return null;
    return { userId: p.sub, clientId: p.client_id, scope: p.scope };
  } catch {
    return null;
  }
}
