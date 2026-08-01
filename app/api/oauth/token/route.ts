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
} from "@/lib/mcp/store";
import {
  signAccessToken,
  verifyPkce,
  ACCESS_TOKEN_TTL_SECONDS,
} from "@/lib/mcp/oauth";
import {
  resolveClient,
  extractClientAuth,
  clientSecretMatches,
} from "@/lib/mcp/clients";
import { corsPreflight, jsonWithCors, oauthError } from "@/lib/mcp/http";

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

async function issueTokens(userId: string, clientId: string, scope?: string) {
  const accessToken = await signAccessToken({ userId, clientId, scope });
  const refreshToken = await createRefreshToken({ userId, clientId, scope });
  return jsonWithCors({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: refreshToken,
    scope,
  });
}

export async function POST(request: NextRequest) {
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
    // Non-rotating for the MVP: issue a fresh access token, keep the refresh.
    const accessToken = await signAccessToken({
      userId: record.userId,
      clientId: record.clientId,
      scope: record.scope ?? undefined,
    });
    return jsonWithCors({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      scope: record.scope ?? undefined,
    });
  }

  return oauthError("unsupported_grant_type");
}

export function OPTIONS() {
  return corsPreflight();
}
