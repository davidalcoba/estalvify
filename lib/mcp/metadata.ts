// OAuth 2.0 Authorization Server metadata (RFC 8414) for the MCP API.
// Served at /.well-known/oauth-authorization-server so MCP clients can discover
// the authorize/token/register endpoints and supported capabilities.

import { getStaticClient } from "./clients";

export function buildAuthServerMetadata(origin: string) {
  const staticClient = getStaticClient();

  const meta: Record<string, unknown> = {
    issuer: origin,
    authorization_endpoint: `${origin}/api/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: ["mcp"],
  };

  if (!staticClient) {
    // Open Dynamic Client Registration, public clients (PKCE only).
    meta.registration_endpoint = `${origin}/api/oauth/register`;
    meta.token_endpoint_auth_methods_supported = ["none"];
  } else {
    // Pre-configured client; open registration is closed.
    meta.token_endpoint_auth_methods_supported = staticClient.clientSecret
      ? ["client_secret_post", "client_secret_basic"]
      : ["none"];
  }

  return meta;
}
