// OAuth 2.0 Authorization Server metadata (RFC 8414) for the MCP API.
// Served at /.well-known/oauth-authorization-server so MCP clients can discover
// the authorize/token/register endpoints and supported capabilities.

export function buildAuthServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/api/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    // Public clients (Claude) authenticate with PKCE, not a client secret.
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["mcp"],
  };
}
