// RFC 9728 — Protected Resource Metadata for the MCP endpoint.
// Points MCP clients at our Authorization Server (this same origin) so they can
// discover /.well-known/oauth-authorization-server and begin the OAuth flow.
import { NextRequest } from "next/server";
import { corsPreflight, jsonWithCors } from "@/lib/mcp/http";

export function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  return jsonWithCors({
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
  });
}

export function OPTIONS() {
  return corsPreflight();
}
