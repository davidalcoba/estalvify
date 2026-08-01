// RFC 8414 — Authorization Server metadata discovery for MCP clients.
import { NextRequest } from "next/server";
import { buildAuthServerMetadata } from "@/lib/mcp/metadata";
import { corsPreflight, jsonWithCors } from "@/lib/mcp/http";

export function GET(request: NextRequest) {
  return jsonWithCors(buildAuthServerMetadata(request.nextUrl.origin));
}

export function OPTIONS() {
  return corsPreflight();
}
