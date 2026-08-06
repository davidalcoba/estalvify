// /invite/<token> — landing page for a household invitation link.
//
// Requires a session (the proxy bounces to /login preserving this URL as the
// callback). Validation runs server-side against the token's HASH; the accept
// button re-validates everything in the action — this render is presentation,
// not trusted state. Uses the (auth) layout: centered card, no app shell,
// because the visitor may not belong to any household yet.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { findInviteForToken } from "@/lib/household/manage";
import { validateInviteForAcceptance } from "@/lib/household/invite";
import { acceptInvite } from "../actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LogoMark } from "@/components/brand/logo";

export const metadata: Metadata = { title: "Invitation" };

const ROLE_LABEL: Record<string, string> = {
  EDITOR: "Editor — can categorize, edit rules and the plan, and manage bank connections",
  VIEWER: "Viewer — read-only access to everything",
};

// Why the invite cannot be accepted, in words the invitee can act on.
const ERROR_MESSAGES: Record<string, string> = {
  not_found: "This invitation link is not valid.",
  revoked: "This invitation was revoked. Ask for a new link.",
  already_accepted: "This invitation was already used.",
  expired: "This invitation has expired. Ask for a new link.",
  email_mismatch:
    "This invitation was issued for a different email address. Sign in with the invited account, or ask for a new link.",
};

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;

  const session = await auth();
  if (!session?.user) redirect(`/login?callbackUrl=/invite/${token}`);

  // Where "not now" leads: members go back to the app; a user with no
  // household goes to /welcome, where NOTHING is created unless they choose
  // to — declining an invite must never mint an account's household.
  const membership = await prisma.householdMember.findFirst({
    where: { userId: session.user.id },
    select: { id: true },
  });
  const backHref = membership ? "/dashboard" : "/welcome";

  // An acceptance attempt bounced back with a reason — show it.
  if (error) {
    return (
      <InviteShell title="Can't accept this invitation">
        <p className="text-sm text-muted-foreground">
          {ERROR_MESSAGES[error] ?? "Something went wrong. Please try again."}
        </p>
        <BackToApp href={backHref} />
      </InviteShell>
    );
  }

  const invite = await findInviteForToken(token);
  const validation = validateInviteForAcceptance(
    invite,
    session.user.email,
    new Date()
  );

  if (!validation.ok) {
    return (
      <InviteShell title="Can't accept this invitation">
        <p className="text-sm text-muted-foreground">
          {ERROR_MESSAGES[validation.reason]}
        </p>
        <BackToApp href={backHref} />
      </InviteShell>
    );
  }

  const found = invite!;
  const inviter = await prisma.user.findUnique({
    where: { id: found.invitedByUserId },
    select: { name: true, email: true },
  });
  const inviterLabel = inviter?.name ?? inviter?.email ?? "The owner";
  const acceptAction = acceptInvite.bind(null, token);

  return (
    <InviteShell
      title={`Join “${found.household.name}”`}
      description={`${inviterLabel} invited you to their household on Estalvify.`}
    >
      <div className="rounded-md border bg-muted/40 p-3 text-sm">
        <p className="font-medium">Your role</p>
        <p className="text-muted-foreground">
          {ROLE_LABEL[found.role] ?? found.role}
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        You&apos;ll see this household&apos;s accounts, transactions and plans.
        You can be removed by the owner at any time.
      </p>
      <form action={acceptAction}>
        <Button type="submit" className="w-full">
          Accept invitation
        </Button>
      </form>
      <BackToApp href={backHref} label="Not now" />
    </InviteShell>
  );
}

function InviteShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader className="space-y-2 text-center">
        <div className="mb-2 flex justify-center">
          <LogoMark className="size-12 rounded-xl" />
        </div>
        <CardTitle className="text-2xl font-bold tracking-tight">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function BackToApp({
  href,
  label = "Go to the app",
}: {
  href: string;
  label?: string;
}) {
  return (
    <Button asChild variant="ghost" className="w-full">
      <Link href={href}>{label}</Link>
    </Button>
  );
}
