// POST/GET /api/mcp — MCP server (Streamable HTTP) for the Estalvify API.
//
// Auth: bearer access tokens issued by our OAuth AS (see app/api/oauth/*).
// verifyToken validates the JWT and hands the tools the userId via authInfo.extra.
// Unauthenticated requests get a 401 pointing at the protected-resource metadata,
// which lets MCP clients discover the authorization server and start the flow.

import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { verifyAccessToken } from "@/lib/mcp/oauth";
import { registerTools } from "@/lib/mcp/tools";
import { scopesFromClaim } from "@/lib/mcp/scopes";

export const maxDuration = 60;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function verifyToken(
  _req: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;
  const claims = await verifyAccessToken(bearerToken);
  if (!claims) return undefined;
  return {
    token: bearerToken,
    clientId: claims.clientId,
    // Legacy tokens without a scope claim keep full access (they expire within
    // the hour); tools enforce read/write against this list.
    scopes: scopesFromClaim(claims.scope),
    extra: { userId: claims.userId },
  };
}

// Build the handler lazily on first request. Constructing it at module scope
// runs mcp-handler setup during `next build`'s page-data collection, which
// crashes the static-generation worker (observed as a spurious /favicon.ico
// prerender error). Deferring to request time keeps module import side-effect-free.
let handler: ((req: Request) => Promise<Response>) | null = null;

function getHandler(): (req: Request) => Promise<Response> {
  if (!handler) {
    const base = createMcpHandler(
      (server) => {
        registerTools(server);
      },
      { serverInfo: { name: "estalvify-mcp", version: "0.1.0" } },
      { basePath: "/api" },
    );
    handler = withMcpAuth(base, verifyToken, {
      required: true,
      resourceMetadataPath: "/.well-known/oauth-protected-resource",
    });
  }
  return handler;
}

export function GET(req: Request): Promise<Response> {
  return getHandler()(req);
}

export function POST(req: Request): Promise<Response> {
  return getHandler()(req);
}
