// Persistence for the MCP OAuth Authorization Server.
//
// Thin Prisma-backed helpers used by the /api/oauth/* endpoints. Raw codes and
// refresh tokens are returned to the caller once; only their hashes are stored.

import { prisma } from "@/lib/prisma";
import {
  generateOpaqueToken,
  hashToken,
  AUTH_CODE_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
} from "./oauth";

// ── Clients (Dynamic Client Registration) ─────────────────────────────────────

export async function registerClient(input: {
  redirectUris: string[];
  clientName?: string;
}) {
  const clientId = "mcp_" + generateOpaqueToken(16);
  return prisma.mcpOAuthClient.create({
    data: {
      clientId,
      clientName: input.clientName ?? null,
      redirectUris: input.redirectUris,
    },
  });
}

export function getClient(clientId: string) {
  return prisma.mcpOAuthClient.findUnique({ where: { clientId } });
}

/**
 * Make sure a client id exists as a row before anything references it.
 *
 * The static confidential client (`MCP_OAUTH_CLIENT_ID`) is configuration, not a
 * registration, so it has no row — but `mcp_auth_codes` and `mcp_refresh_tokens`
 * both carry a foreign key to `mcp_oauth_clients.clientId`. Minting a code for a
 * configured-only client therefore fails with a foreign-key violation, which
 * surfaces as a crashed function rather than an OAuth error: the browser gets no
 * response at all. Upserting lazily keeps the static client working on any
 * database without a seed step — which matters because every preview deployment
 * gets a fresh Neon branch.
 *
 * The secret is deliberately not stored: it stays in the environment, and
 * `clientSecretMatches` compares against that. This row exists only to satisfy
 * the foreign key.
 */
export async function ensureClientRow(input: {
  clientId: string;
  redirectUris: string[];
}) {
  return prisma.mcpOAuthClient.upsert({
    where: { clientId: input.clientId },
    update: {},
    create: {
      clientId: input.clientId,
      clientName: "Configured static client",
      redirectUris: input.redirectUris,
    },
  });
}

// ── Authorization codes (single-use, PKCE-bound) ──────────────────────────────

export async function createAuthCode(input: {
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope?: string;
  /** Household active at consent time — the minted tokens bind to it. */
  householdId?: string | null;
}): Promise<string> {
  const code = generateOpaqueToken(32);
  await prisma.mcpAuthCode.create({
    data: {
      codeHash: hashToken(code),
      clientId: input.clientId,
      userId: input.userId,
      redirectUri: input.redirectUri,
      codeChallenge: input.codeChallenge,
      codeChallengeMethod: input.codeChallengeMethod,
      scope: input.scope ?? null,
      householdId: input.householdId ?? null,
      expiresAt: new Date(Date.now() + AUTH_CODE_TTL_SECONDS * 1000),
    },
  });
  return code;
}

/**
 * Atomically claim an authorization code: marks it used and returns the record,
 * or null if it doesn't exist, is expired, or was already used. The updateMany
 * guard makes redemption single-use even under concurrent requests.
 */
export async function consumeAuthCode(code: string) {
  const codeHash = hashToken(code);
  const now = new Date();
  const claimed = await prisma.mcpAuthCode.updateMany({
    where: { codeHash, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  if (claimed.count !== 1) return null;
  return prisma.mcpAuthCode.findUnique({ where: { codeHash } });
}

// ── Refresh tokens ────────────────────────────────────────────────────────────

export async function createRefreshToken(input: {
  clientId: string;
  userId: string;
  scope?: string;
  householdId?: string | null;
}): Promise<string> {
  const token = generateOpaqueToken(32);
  await prisma.mcpRefreshToken.create({
    data: {
      tokenHash: hashToken(token),
      clientId: input.clientId,
      userId: input.userId,
      scope: input.scope ?? null,
      householdId: input.householdId ?? null,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
    },
  });
  return token;
}

/** Look up a valid (non-revoked, non-expired) refresh token, or null. */
export async function getValidRefreshToken(token: string) {
  const record = await prisma.mcpRefreshToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  if (!record) return null;
  if (record.revokedAt) return null;
  if (record.expiresAt.getTime() <= Date.now()) return null;
  return record;
}

/**
 * Revoke a refresh token presented by a client (RFC 7009). Scoped to the
 * authenticated client so one client cannot revoke another's tokens. Returns
 * quietly whether or not anything matched — the RFC requires 200 either way,
 * so an attacker cannot use the endpoint as a token-validity oracle.
 */
export async function revokeRefreshToken(
  token: string,
  clientId: string,
): Promise<void> {
  await prisma.mcpRefreshToken.updateMany({
    where: { tokenHash: hashToken(token), clientId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Atomically retire a refresh token and mint its replacement (rotation).
 * The revocation is guarded on `revokedAt: null`, so a replayed token loses
 * the race and gets nothing — the caller must treat a null return as an
 * invalid grant.
 */
export async function rotateRefreshToken(record: {
  id: string;
  clientId: string;
  userId: string;
  scope: string | null;
  householdId: string | null;
}): Promise<string | null> {
  const claimed = await prisma.mcpRefreshToken.updateMany({
    where: { id: record.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (claimed.count !== 1) return null;
  return createRefreshToken({
    clientId: record.clientId,
    userId: record.userId,
    scope: record.scope ?? undefined,
    householdId: record.householdId,
  });
}
