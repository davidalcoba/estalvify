// OAuth client resolution for the MCP Authorization Server.
//
// Two modes:
//  - Static confidential client (recommended): configured via env
//    (MCP_OAUTH_CLIENT_ID [+ MCP_OAUTH_CLIENT_SECRET]). When set, open Dynamic
//    Client Registration is DISABLED and only this client id is accepted. If a
//    secret is configured the token endpoint requires client authentication.
//  - Dynamic clients (fallback): registered via /api/oauth/register and stored
//    in the DB. Only used when no static client is configured.

import { timingSafeEqual } from "node:crypto";

export interface ResolvedClient {
  clientId: string;
  /** Exact redirect_uri allowlist (may be empty for a static client → host rule). */
  redirectUris: string[];
  /** Present ⇒ confidential client; token endpoint must authenticate the secret. */
  clientSecret?: string;
  isStatic: boolean;
}

// Anthropic-hosted callback hosts trusted for the personal static client, so the
// exact callback path doesn't have to be pinned in env.
const CLAUDE_HOSTS = new Set(["claude.ai", "claude.com"]);

export function getStaticClient(): ResolvedClient | null {
  const clientId = process.env.MCP_OAUTH_CLIENT_ID?.trim();
  if (!clientId) return null;
  const clientSecret = process.env.MCP_OAUTH_CLIENT_SECRET?.trim() || undefined;
  const redirectUris = (process.env.MCP_OAUTH_REDIRECT_URIS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return { clientId, redirectUris, clientSecret, isStatic: true };
}

/** Open Dynamic Client Registration is disabled whenever a static client exists. */
export function isDcrDisabled(): boolean {
  return getStaticClient() !== null;
}

export async function resolveClient(
  clientId: string,
): Promise<ResolvedClient | null> {
  const staticClient = getStaticClient();
  if (staticClient) {
    return clientId === staticClient.clientId ? staticClient : null;
  }
  // Lazy import so the DB/Prisma chain isn't pulled in when only the static
  // client / pure helpers are used (keeps module import side-effect-free).
  const { getClient } = await import("./store");
  const db = await getClient(clientId);
  if (!db) return null;
  return { clientId: db.clientId, redirectUris: db.redirectUris, isStatic: false };
}

export function isAllowedRedirectUri(
  redirectUri: string,
  client: ResolvedClient,
): boolean {
  if (client.redirectUris.includes(redirectUri)) return true;
  if (client.isStatic) {
    try {
      return CLAUDE_HOSTS.has(new URL(redirectUri).hostname);
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Extract client credentials from an OAuth token request: HTTP Basic
 * (client_secret_basic) or body params (client_secret_post).
 */
export function extractClientAuth(
  authHeader: string | null,
  params: Record<string, string>,
): { clientId?: string; clientSecret?: string } {
  if (authHeader && /^Basic /i.test(authHeader)) {
    try {
      const decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf8");
      const sep = decoded.indexOf(":");
      if (sep >= 0) {
        return {
          clientId: decoded.slice(0, sep),
          clientSecret: decoded.slice(sep + 1),
        };
      }
    } catch {
      // fall through to body params
    }
  }
  return { clientId: params.client_id, clientSecret: params.client_secret };
}

/** Constant-time client-secret comparison. */
export function clientSecretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
