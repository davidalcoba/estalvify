// /welcome — the landing for a signed-in user with NO household membership
// (PLAN_MULTIUSER.md phase 6-lite). getScope redirects here; this page must
// therefore use the session directly, never getScope.
//
// Household creation is an EXPLICIT choice here — never a sign-in side
// effect: someone who followed an invite link may not want an account of
// their own at all, so the third option is simply signing out. Pending
// invitations for the session email are acceptable directly (the
// email-must-match rule holds with or without the link's token).

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { listPendingInvitesForEmail } from "@/lib/household/manage";
import {
  acceptPendingInvite,
  createMyHousehold,
  signOutFromWelcome,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LogoMark } from "@/components/brand/logo";

export const metadata: Metadata = { title: "Welcome" };

const ROLE_LABEL: Record<string, string> = {
  EDITOR: "Editor",
  VIEWER: "Viewer",
};

const ERROR_MESSAGES: Record<string, string> = {
  not_found: "That invitation is no longer valid.",
  revoked: "That invitation was revoked. Ask for a new one.",
  already_accepted: "That invitation was already used.",
  expired: "That invitation has expired. Ask for a new one.",
  email_mismatch: "That invitation was issued for a different email address.",
};

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/welcome");

  // Already in a household? This page has nothing to offer — the app does.
  const membership = await prisma.householdMember.findFirst({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (membership) redirect("/dashboard");

  const [{ error }, invites] = await Promise.all([
    searchParams,
    listPendingInvitesForEmail(session.user.email),
  ]);

  return (
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader className="space-y-2 text-center">
        <div className="mb-2 flex justify-center">
          <LogoMark className="size-12 rounded-xl" />
        </div>
        <CardTitle className="text-2xl font-bold tracking-tight">
          Welcome to Estalvify
        </CardTitle>
        <CardDescription>
          You&apos;re signed in as{" "}
          <span className="font-medium text-foreground">{session.user.email}</span>,
          but you don&apos;t belong to any household yet.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {ERROR_MESSAGES[error] ?? "Something went wrong. Please try again."}
          </p>
        )}

        {invites.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm font-medium">Pending invitations</p>
            <ul className="space-y-2">
              {invites.map((invite) => (
                <li
                  key={invite.id}
                  className="flex items-center gap-3 rounded-md border p-3 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{invite.householdName}</p>
                    <p className="text-xs text-muted-foreground">
                      {ROLE_LABEL[invite.role] ?? invite.role}
                      {invite.invitedByName ? ` · invited by ${invite.invitedByName}` : ""}
                    </p>
                  </div>
                  <form action={acceptPendingInvite.bind(null, invite.id)}>
                    <Button type="submit" size="sm">
                      Join
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className={invites.length > 0 ? "space-y-3 border-t pt-5" : "space-y-3"}>
          <p className="text-sm font-medium">Start your own household</p>
          <form action={createMyHousehold} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="household-name">Household name</Label>
              <Input
                id="household-name"
                name="name"
                placeholder="My household"
                maxLength={60}
                autoComplete="off"
              />
            </div>
            <Button type="submit" className="w-full">
              Create household
            </Button>
          </form>
        </div>

        <div className="border-t pt-5">
          <p className="pb-3 text-xs text-muted-foreground">
            Don&apos;t want to set anything up? Just sign out — nothing has
            been created for this account.
          </p>
          <form action={signOutFromWelcome}>
            <Button type="submit" variant="ghost" className="w-full">
              Sign out
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
