"use server";

// Consent decisions for the MCP OAuth flow. The consent page posts back here;
// every parameter is re-validated against the same rules as /api/oauth/authorize
// before anything is minted — the form fields are transport, not trusted state.

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { createAuthCode, ensureClientRow } from "@/lib/mcp/store";
import { resolveClient, isAllowedRedirectUri } from "@/lib/mcp/clients";
import { normalizeRequestedScope } from "@/lib/mcp/scopes";
import { resolveActiveMembership } from "@/lib/household/active";

interface ConsentParams {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  state: string | null;
  scope: string | null;
}

function readParams(formData: FormData): ConsentParams {
  const get = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" && v.length > 0 ? v : null;
  };
  return {
    clientId: get("client_id") ?? "",
    redirectUri: get("redirect_uri") ?? "",
    codeChallenge: get("code_challenge") ?? "",
    codeChallengeMethod: get("code_challenge_method") ?? "S256",
    state: get("state"),
    scope: get("scope"),
  };
}

/** Validate client + redirect target; throws on anything untrustworthy. */
async function requireValidClient(params: ConsentParams) {
  const client = await resolveClient(params.clientId);
  if (!client) throw new Error("Unknown client");
  if (
    !params.redirectUri ||
    !isAllowedRedirectUri(params.redirectUri, client)
  ) {
    throw new Error("Invalid redirect_uri");
  }
  return client;
}

function clientRedirect(
  redirectUri: string,
  query: Record<string, string>,
  state: string | null,
): never {
  const url = new URL(redirectUri);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  if (state) url.searchParams.set("state", state);
  redirect(url.toString());
}

export async function approveConsent(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const params = readParams(formData);
  const client = await requireValidClient(params);

  if (!params.codeChallenge || params.codeChallengeMethod !== "S256") {
    clientRedirect(
      params.redirectUri,
      { error: "invalid_request", error_description: "PKCE (S256) is required" },
      params.state,
    );
  }

  // Narrow the requested scope to what we actually grant; the token endpoint
  // issues tokens carrying exactly what is stored on the code.
  const grantedScope = normalizeRequestedScope(params.scope);

  // A static client is configuration rather than a registration, so it has no
  // row yet — and the code table has a foreign key to one. See ensureClientRow.
  if (client.isStatic) {
    await ensureClientRow({
      clientId: client.clientId,
      redirectUris: client.redirectUris,
    });
  }
  // The tokens bind to the household ACTIVE at consent time (phase 6-lite) —
  // that is what the consent screen displayed, so it is what was approved.
  const membership = await resolveActiveMembership(session.user.id);

  const code = await createAuthCode({
    clientId: client.clientId,
    userId: session.user.id,
    redirectUri: params.redirectUri,
    codeChallenge: params.codeChallenge,
    codeChallengeMethod: params.codeChallengeMethod,
    scope: grantedScope,
    householdId: membership?.householdId ?? null,
  });

  clientRedirect(params.redirectUri, { code }, params.state);
}

export async function denyConsent(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const params = readParams(formData);
  await requireValidClient(params);

  clientRedirect(params.redirectUri, { error: "access_denied" }, params.state);
}
