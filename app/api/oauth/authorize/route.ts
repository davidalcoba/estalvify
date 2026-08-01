// GET /api/oauth/authorize — OAuth 2.1 authorization endpoint (PKCE required).
//
// Human authentication is delegated to the existing Auth.js Google session:
// unauthenticated users are bounced to /login with a callbackUrl that returns
// here after sign-in. For this personal/household deployment we auto-approve
// (no scope-consent screen) once a valid session exists.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createAuthCode } from "@/lib/mcp/store";
import { resolveClient, isAllowedRedirectUri } from "@/lib/mcp/clients";

/** Redirect back to the client with an OAuth error (RFC 6749 §4.1.2.1). */
function errorRedirect(
  redirectUri: string,
  error: string,
  state: string | null,
  description?: string,
): NextResponse {
  const url = new URL(redirectUri);
  url.searchParams.set("error", error);
  if (description) url.searchParams.set("error_description", description);
  if (state) url.searchParams.set("state", state);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const clientId = p.get("client_id");
  const redirectUri = p.get("redirect_uri");
  const responseType = p.get("response_type");
  const codeChallenge = p.get("code_challenge");
  const codeChallengeMethod = p.get("code_challenge_method") ?? "S256";
  const state = p.get("state");
  const scope = p.get("scope") ?? undefined;

  // 1) Validate the client and redirect_uri BEFORE trusting the redirect target.
  if (!clientId) {
    return new NextResponse("Missing client_id", { status: 400 });
  }
  const client = await resolveClient(clientId);
  if (!client) {
    return new NextResponse("Unknown client_id", { status: 400 });
  }
  if (!redirectUri || !isAllowedRedirectUri(redirectUri, client)) {
    return new NextResponse("Invalid redirect_uri", { status: 400 });
  }

  // 2) From here, errors can safely redirect back to the (trusted) client.
  if (responseType !== "code") {
    return errorRedirect(redirectUri, "unsupported_response_type", state);
  }
  if (!codeChallenge) {
    return errorRedirect(
      redirectUri,
      "invalid_request",
      state,
      "code_challenge is required (PKCE)",
    );
  }
  if (codeChallengeMethod !== "S256") {
    return errorRedirect(
      redirectUri,
      "invalid_request",
      state,
      "Only the S256 code_challenge_method is supported",
    );
  }

  // 3) Require an authenticated Auth.js session; else send to Google login and
  //    come back here afterwards.
  const session = await auth();
  if (!session?.user?.id) {
    const returnTo = request.nextUrl.pathname + request.nextUrl.search;
    const loginUrl = new URL("/login", request.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", returnTo);
    return NextResponse.redirect(loginUrl);
  }

  // 4) Auto-approve: mint a single-use, PKCE-bound authorization code.
  const code = await createAuthCode({
    clientId,
    userId: session.user.id,
    redirectUri,
    codeChallenge,
    codeChallengeMethod,
    scope,
  });

  const redirect = new URL(redirectUri);
  redirect.searchParams.set("code", code);
  if (state) redirect.searchParams.set("state", state);
  return NextResponse.redirect(redirect);
}
