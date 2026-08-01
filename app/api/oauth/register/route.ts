// POST /api/oauth/register — Dynamic Client Registration (RFC 7591, subset).
// MCP clients (e.g. Claude) self-register here before starting the auth flow.
// Public clients only: no client secret is issued; PKCE is required at authorize.

import { NextRequest } from "next/server";
import { z } from "zod";
import { registerClient } from "@/lib/mcp/store";
import { isDcrDisabled } from "@/lib/mcp/clients";
import { corsPreflight, jsonWithCors, oauthError } from "@/lib/mcp/http";

const registerSchema = z.object({
  redirect_uris: z.array(z.string().url()).min(1),
  client_name: z.string().max(200).optional(),
  // Accepted for spec-compliance but ignored (we only support these values).
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
  token_endpoint_auth_method: z.string().optional(),
});

export async function POST(request: NextRequest) {
  // When a pre-configured client is set, open registration is closed.
  if (isDcrDisabled()) {
    return oauthError(
      "access_denied",
      "Dynamic client registration is disabled; use the configured client_id.",
      403,
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return oauthError("invalid_request", "Body must be JSON");
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return oauthError("invalid_client_metadata", parsed.error.message);
  }

  const client = await registerClient({
    redirectUris: parsed.data.redirect_uris,
    clientName: parsed.data.client_name,
  });

  return jsonWithCors(
    {
      client_id: client.clientId,
      client_name: client.clientName ?? undefined,
      redirect_uris: client.redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    { status: 201 },
  );
}

export function OPTIONS() {
  return corsPreflight();
}
