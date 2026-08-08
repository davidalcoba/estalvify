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
import { getT } from "@/lib/i18n/server";
import type { Translator } from "@/lib/i18n/translate";
import type { MessageKey } from "@/lib/i18n/dictionaries/en";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("invite.metaTitle") };
}

const ROLE_LABEL: Record<string, MessageKey> = {
  EDITOR: "invite.role.EDITOR",
  VIEWER: "invite.role.VIEWER",
};

// Why the invite cannot be accepted, in words the invitee can act on.
const ERROR_MESSAGES: Record<string, MessageKey> = {
  not_found: "invite.error.not_found",
  revoked: "invite.error.revoked",
  already_accepted: "invite.error.already_accepted",
  expired: "invite.error.expired",
  email_mismatch: "invite.error.email_mismatch",
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
  const t = await getT();

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
      <InviteShell title={t("invite.cannotAccept")}>
        <p className="text-sm text-muted-foreground">
          {t(ERROR_MESSAGES[error] ?? "invite.error.generic")}
        </p>
        <BackToApp t={t} href={backHref} />
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
      <InviteShell title={t("invite.cannotAccept")}>
        <p className="text-sm text-muted-foreground">
          {t(ERROR_MESSAGES[validation.reason] ?? "invite.error.generic")}
        </p>
        <BackToApp t={t} href={backHref} />
      </InviteShell>
    );
  }

  const found = invite!;
  const inviter = await prisma.user.findUnique({
    where: { id: found.invitedByUserId },
    select: { name: true, email: true },
  });
  const inviterLabel = inviter?.name ?? inviter?.email ?? t("invite.defaultInviter");
  const acceptAction = acceptInvite.bind(null, token);

  return (
    <InviteShell
      title={t("invite.join", { household: found.household.name })}
      description={t("invite.invitedBy", { who: inviterLabel })}
    >
      <div className="rounded-md border bg-muted/40 p-3 text-sm">
        <p className="font-medium">{t("invite.yourRole")}</p>
        <p className="text-muted-foreground">
          {ROLE_LABEL[found.role] ? t(ROLE_LABEL[found.role]) : found.role}
        </p>
      </div>
      <p className="text-xs text-muted-foreground">{t("invite.disclaimer")}</p>
      <form action={acceptAction}>
        <Button type="submit" className="w-full">
          {t("invite.accept")}
        </Button>
      </form>
      <BackToApp t={t} href={backHref} label={t("invite.notNow")} />
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
  t,
  href,
  label,
}: {
  t: Translator;
  href: string;
  label?: string;
}) {
  return (
    <Button asChild variant="ghost" className="w-full">
      <Link href={href}>{label ?? t("invite.goToApp")}</Link>
    </Button>
  );
}
