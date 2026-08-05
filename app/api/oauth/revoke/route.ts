// POST /api/oauth/revoke — OAuth 2.0 Token Revocation (RFC 7009).
//
// Accepts a refresh token and revokes it for the authenticated client. Access
// tokens are stateless JWTs (≤ 1 hour) and cannot be individually revoked;
// per the RFC we still return 200 for them — revoking the refresh token is
// what actually ends a grant. The response is 200 whether or not the token
// matched, so the endpoint is not a validity oracle.

import { NextRequest, NextResponse } from "next/server";
import { revokeRefreshToken } from "@/lib/mcp/store";
import {
  resolveClient,
  extractClientAuth,
  clientSecretMatches,
} from "@/lib/mcp/clients";
import { corsPreflight, corsHeaders, oauthError } from "@/lib/mcp/http";
import { consumeRateLimit, clientIp } from "@/lib/rate-limit";

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

export async function POST(request: NextRequest) {
  if (!(await consumeRateLimit("oauth-revoke", clientIp(request)))) {
    return oauthError("slow_down", "Too many requests — retry later", 429);
  }

  let params: Record<string, string>;
  try {
    params = await readParams(request);
  } catch {
    return oauthError("invalid_request", "Malformed request body");
  }

  // Same client authentication as the token endpoint: a confidential client
  // must present its secret; a public client is identified by client_id.
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

  const token = params.token;
  if (!token) {
    return oauthError("invalid_request", "token is required");
  }

  await revokeRefreshToken(token, client.clientId);

  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

export function OPTIONS() {
  return corsPreflight();
}
