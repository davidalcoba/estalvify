// POST /api/oauth/token — OAuth 2.1 token endpoint.
// Supports the authorization_code (with PKCE) and refresh_token grants.
//
// Client authentication:
//  - Confidential static client (MCP_OAUTH_CLIENT_SECRET set): the client must
//    authenticate with its secret (client_secret_basic or client_secret_post).
//  - Public client (no secret / dynamic client): PKCE binds the code to the client.

import { NextRequest, NextResponse } from "next/server";
import {
  consumeAuthCode,
  getValidRefreshToken,
  createRefreshToken,
  rotateRefreshToken,
} from "@/lib/mcp/store";
import { prisma } from "@/lib/prisma";
import { isEmailAllowed } from "@/lib/auth/allowed-emails";
import {
  signAccessToken,
  verifyPkce,
  ACCESS_TOKEN_TTL_SECONDS,
} from "@/lib/mcp/oauth";
import { scopesForRole, scopesFromClaim } from "@/lib/mcp/scopes";
import type { HouseholdRole } from "@/app/generated/prisma";
import {
  resolveClient,
  extractClientAuth,
  clientSecretMatches,
} from "@/lib/mcp/clients";
import { corsPreflight, jsonWithCors, oauthError } from "@/lib/mcp/http";
import { consumeRateLimit, clientIp } from "@/lib/rate-limit";

/** Parse either form-encoded (OAuth default) or JSON bodies into a flat map. */
async function readParams(request: NextRequest): Promise<Record<string, string>> {
  const ct = request.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const body = (await request.json()) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(body).map(([k, v]) => [k, String(v ?? "")]),
    );
  }
  const form = await request.formData();
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) out[k] = String(v);
  return out;
}

/**
 * Resolve and authenticate the client for this token request. Returns the
 * verified clientId, or a NextResponse error to return directly.
 */
async function authenticateClient(
  request: NextRequest,
  params: Record<string, string>,
): Promise<{ clientId: string } | NextResponse> {
  const { clientId, clientSecret } = extractClientAuth(
    request.headers.get("authorization"),
    params,
  );
  if (!clientId) {
    return oauthError("invalid_request", "client_id is required");
  }
  const client = await resolveClient(clientId);
  if (!client) {
    return oauthError("invalid_client", "Unknown client", 401);
  }
  if (client.clientSecret) {
    if (!clientSecret || !clientSecretMatches(clientSecret, client.clientSecret)) {
      return oauthError("invalid_client", "Client authentication failed", 401);
    }
  }
  return { clientId: client.clientId };
}

/**
 * The member's household context at mint time (PLAN_MULTIUSER.md phase 4).
 * No membership = own-owner semantics (pre-household tokens behaved exactly
 * like this; the app layout bootstraps the household row on first visit).
 */
async function householdContext(
  userId: string,
): Promise<{ dataUserId: string; role: HouseholdRole }> {
  const membership = await prisma.householdMember.findUnique({
    where: { userId },
    select: { role: true, household: { select: { ownerUserId: true } } },
  });
  return membership
    ? { dataUserId: membership.household.ownerUserId, role: membership.role }
    : { dataUserId: userId, role: "OWNER" };
}

/**
 * The scope actually minted: granted scopes intersected with the member's
 * role — a VIEWER's token is read-only regardless of consent. The refresh
 * token keeps the ORIGINAL scope, so a role change (VIEWER → EDITOR) restores
 * the full grant at the next refresh instead of narrowing it forever.
 */
function effectiveScope(scope: string | undefined, role: HouseholdRole): string {
  return scopesForRole(scopesFromClaim(scope), role).join(" ");
}

async function issueTokens(userId: string, clientId: string, scope?: string) {
  const ctx = await householdContext(userId);
  const minted = effectiveScope(scope, ctx.role);
  const accessToken = await signAccessToken({
    userId,
    clientId,
    scope: minted,
    dataUserId: ctx.dataUserId,
    role: ctx.role,
  });
  const refreshToken = await createRefreshToken({ userId, clientId, scope });
  return jsonWithCors({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: refreshToken,
    scope: minted,
  });
}

export async function POST(request: NextRequest) {
  // Per-IP window: bounds client-secret and code/refresh-token guessing.
  if (!(await consumeRateLimit("oauth-token", clientIp(request)))) {
    return oauthError("slow_down", "Too many requests — retry later", 429);
  }

  let params: Record<string, string>;
  try {
    params = await readParams(request);
  } catch {
    return oauthError("invalid_request", "Malformed request body");
  }

  const auth = await authenticateClient(request, params);
  if (auth instanceof NextResponse) return auth;
  const clientId = auth.clientId;

  const grantType = params.grant_type;

  // ── authorization_code ──────────────────────────────────────────────────────
  if (grantType === "authorization_code") {
    const { code, redirect_uri, code_verifier } = params;
    if (!code || !code_verifier) {
      return oauthError(
        "invalid_request",
        "code and code_verifier are required",
      );
    }

    const record = await consumeAuthCode(code);
    if (!record) {
      return oauthError("invalid_grant", "Authorization code invalid or expired");
    }
    if (record.clientId !== clientId) {
      return oauthError("invalid_grant", "client_id mismatch");
    }
    if (record.redirectUri !== redirect_uri) {
      return oauthError("invalid_grant", "redirect_uri mismatch");
    }
    if (!verifyPkce(code_verifier, record.codeChallenge, record.codeChallengeMethod)) {
      return oauthError("invalid_grant", "PKCE verification failed");
    }

    return issueTokens(record.userId, record.clientId, record.scope ?? undefined);
  }

  // ── refresh_token ─────────────────────────────────────────────────────────────
  if (grantType === "refresh_token") {
    const { refresh_token } = params;
    if (!refresh_token) {
      return oauthError("invalid_request", "refresh_token is required");
    }
    const record = await getValidRefreshToken(refresh_token);
    if (!record || record.clientId !== clientId) {
      return oauthError("invalid_grant", "Refresh token invalid or expired");
    }

    // Re-check the sign-in allowlist at refresh time. Sign-in only gates the
    // Auth.js flow, so without this a user removed from ALLOWED_EMAILS keeps
    // minting MCP access tokens for another 30 days. Denied here means their
    // MCP access ends with the current access token (≤ 1 hour).
    const user = await prisma.user.findUnique({
      where: { id: record.userId },
      select: { email: true },
    });
    if (!user || !isEmailAllowed(user.email, process.env.ALLOWED_EMAILS)) {
      await prisma.mcpRefreshToken.update({
        where: { id: record.id },
        data: { revokedAt: new Date() },
      });
      return oauthError("invalid_grant", "Grant is no longer authorized");
    }

    // Rotation (OAuth 2.1): every refresh retires the presented token and
    // issues a replacement. A replayed (already-rotated) token loses the
    // atomic claim inside rotateRefreshToken and gets invalid_grant.
    const nextRefreshToken = await rotateRefreshToken(record);
    if (!nextRefreshToken) {
      return oauthError("invalid_grant", "Refresh token invalid or expired");
    }
    // Household context is re-resolved on EVERY refresh, so a role change
    // (or joining/leaving a household) propagates within the hour.
    const ctx = await householdContext(record.userId);
    const minted = effectiveScope(record.scope ?? undefined, ctx.role);
    const accessToken = await signAccessToken({
      userId: record.userId,
      clientId: record.clientId,
      scope: minted,
      dataUserId: ctx.dataUserId,
      role: ctx.role,
    });
    return jsonWithCors({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: nextRefreshToken,
      scope: minted,
    });
  }

  return oauthError("unsupported_grant_type");
}

export function OPTIONS() {
  return corsPreflight();
}
