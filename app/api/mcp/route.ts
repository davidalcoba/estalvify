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

export const maxDuration = 60;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = createMcpHandler(
  (server) => {
    registerTools(server);
  },
  { serverInfo: { name: "estalvify-mcp", version: "0.1.0" } },
  { basePath: "/api" },
);

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
    scopes: claims.scope ? claims.scope.split(" ") : [],
    extra: { userId: claims.userId },
  };
}

const authHandler = withMcpAuth(handler, verifyToken, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
});

export { authHandler as GET, authHandler as POST };
