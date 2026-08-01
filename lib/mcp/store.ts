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

// ── Authorization codes (single-use, PKCE-bound) ──────────────────────────────

export async function createAuthCode(input: {
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope?: string;
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
}): Promise<string> {
  const token = generateOpaqueToken(32);
  await prisma.mcpRefreshToken.create({
    data: {
      tokenHash: hashToken(token),
      clientId: input.clientId,
      userId: input.userId,
      scope: input.scope ?? null,
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
