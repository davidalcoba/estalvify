// OAuth consent screen for the MCP API.
//
// /api/oauth/authorize validates the request and lands here; the user sees who
// is asking (the OAuth client) and exactly what will be granted (the scopes),
// and the authorization code is only minted on explicit approval — in the
// server actions, which re-validate everything. Before this screen existed the
// authorize endpoint auto-approved, which was fine for a single-owner
// deployment and wrong for anything more.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LogoMark } from "@/components/brand/logo";
import { resolveActiveMembership } from "@/lib/household/active";
import { resolveClient, isAllowedRedirectUri } from "@/lib/mcp/clients";
import {
  normalizeRequestedScope,
  scopesForRole,
  SCOPE_DESCRIPTIONS,
  type KnownScope,
} from "@/lib/mcp/scopes";
import { approveConsent, denyConsent } from "./actions";

export const metadata: Metadata = { title: "Authorize access" };

interface ConsentSearchParams {
  client_id?: string;
  redirect_uri?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  state?: string;
  scope?: string;
}

export default async function ConsentPage(props: {
  searchParams: Promise<ConsentSearchParams>;
}) {
  const session = await auth();
  const params = await props.searchParams;

  if (!session?.user) {
    // Restart the flow through the authorize endpoint so its checks run again.
    const query = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null) as [string, string][],
    );
    redirect(`/login?callbackUrl=${encodeURIComponent(`/api/oauth/authorize?${query}`)}`);
  }

  // Re-validate what we are about to display. An invalid request renders an
  // error card — never a redirect to an unvetted target.
  const client = params.client_id ? await resolveClient(params.client_id) : null;
  const redirectOk =
    client && params.redirect_uri
      ? isAllowedRedirectUri(params.redirect_uri, client)
      : false;

  if (!client || !redirectOk || !params.code_challenge) {
    return (
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center space-y-2">
          <CardTitle className="text-xl">Invalid authorization request</CardTitle>
          <CardDescription>
            The connection request is missing required parameters or comes from
            an unknown client. Close this window and start the connection again
            from your MCP client.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const clientLabel = client.clientName ?? client.clientId;

  // Show what will ACTUALLY be granted: the token endpoint intersects the
  // scope with the member's role IN THE ACTIVE HOUSEHOLD (the one the minted
  // tokens bind to), so a VIEWER must see read-only here, not a write promise
  // their token will never carry. No membership means own-owner, like the
  // token endpoint's fallback.
  const membership = await resolveActiveMembership(session.user.id);
  const role = membership?.role ?? "OWNER";
  const grantedScopes = scopesForRole(
    normalizeRequestedScope(params.scope).split(" "),
    role,
  ) as KnownScope[];

  return (
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader className="text-center space-y-2 pb-4">
        <div className="flex justify-center mb-2">
          <LogoMark className="size-12 rounded-xl" />
        </div>
        <CardTitle className="text-xl font-bold tracking-tight">
          Authorize access to your Estalvify data
        </CardTitle>
        <CardDescription>
          <span className="font-medium text-foreground">{clientLabel}</span>{" "}
          wants to connect as{" "}
          <span className="font-medium text-foreground">
            {session.user.email}
          </span>
          {membership?.household?.name && (
            <>
              {" "}
              (household{" "}
              <span className="font-medium text-foreground">
                {membership.household.name}
              </span>
              )
            </>
          )}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="rounded-lg border p-4 space-y-3">
          <p className="text-sm font-medium">This will allow it to:</p>
          <ul className="space-y-2">
            {grantedScopes.map((scope) => (
              <li key={scope} className="flex gap-2 text-sm text-muted-foreground">
                <span aria-hidden className="text-brand">
                  •
                </span>
                {SCOPE_DESCRIPTIONS[scope]}
              </li>
            ))}
          </ul>
          {role === "VIEWER" && (
            <p className="text-xs text-muted-foreground">
              Your role in this household is Viewer, so the connection will be
              read-only.
            </p>
          )}
        </div>

        <div className="flex gap-3">
          <form action={denyConsent} className="flex-1">
            <ConsentFields params={params} />
            <Button type="submit" variant="outline" className="w-full">
              Deny
            </Button>
          </form>
          <form action={approveConsent} className="flex-1">
            <ConsentFields params={params} />
            <Button type="submit" className="w-full">
              Allow
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          You can revoke this access at any time by disconnecting the client, or
          from Settings by deleting your account data.
        </p>
      </CardContent>
    </Card>
  );
}

function ConsentFields({ params }: { params: ConsentSearchParams }) {
  return (
    <>
      <input type="hidden" name="client_id" value={params.client_id ?? ""} />
      <input type="hidden" name="redirect_uri" value={params.redirect_uri ?? ""} />
      <input type="hidden" name="code_challenge" value={params.code_challenge ?? ""} />
      <input
        type="hidden"
        name="code_challenge_method"
        value={params.code_challenge_method ?? "S256"}
      />
      <input type="hidden" name="state" value={params.state ?? ""} />
      <input type="hidden" name="scope" value={params.scope ?? ""} />
    </>
  );
}
