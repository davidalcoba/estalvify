// Small HTTP helpers shared by the MCP OAuth endpoints: permissive CORS (MCP
// clients call these cross-origin during discovery/registration) and RFC 6749
// error responses.

import { NextResponse } from "next/server";

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, mcp-protocol-version",
};

export function corsPreflight(): NextResponse {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export function jsonWithCors(body: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(body, {
    ...init,
    headers: { ...corsHeaders, ...(init?.headers ?? {}) },
  });
}

/** RFC 6749 §5.2 token-error response. */
export function oauthError(
  error: string,
  description?: string,
  status = 400,
): NextResponse {
  return jsonWithCors(
    { error, ...(description ? { error_description: description } : {}) },
    { status },
  );
}
