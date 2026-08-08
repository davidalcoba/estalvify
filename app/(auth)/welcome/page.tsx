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
import { getT } from "@/lib/i18n/server";
import { RichText } from "@/components/i18n/rich-text";
import type { MessageKey } from "@/lib/i18n/dictionaries/en";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("auth.welcome.metaTitle") };
}

const ROLE_LABEL: Record<string, MessageKey> = {
  EDITOR: "settings.household.role.editor",
  VIEWER: "settings.household.role.viewer",
};

// Same rejection reasons as /invite — one set of sentences for both screens.
const ERROR_MESSAGES: Record<string, MessageKey> = {
  not_found: "invite.error.not_found",
  revoked: "invite.error.revoked",
  already_accepted: "invite.error.already_accepted",
  expired: "invite.error.expired",
  email_mismatch: "invite.error.email_mismatch",
};

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/welcome");
  const t = await getT();

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
          {t("auth.welcome.title")}
        </CardTitle>
        <CardDescription>
          <RichText
            template={t("auth.welcome.subtitle")}
            slots={{
              email: (
                <span className="font-medium text-foreground">
                  {session.user.email}
                </span>
              ),
            }}
          />
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {t(ERROR_MESSAGES[error] ?? "invite.error.generic")}
          </p>
        )}

        {invites.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm font-medium">{t("auth.welcome.pending")}</p>
            <ul className="space-y-2">
              {invites.map((invite) => (
                <li
                  key={invite.id}
                  className="flex items-center gap-3 rounded-md border p-3 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{invite.householdName}</p>
                    <p className="text-xs text-muted-foreground">
                      {ROLE_LABEL[invite.role] ? t(ROLE_LABEL[invite.role]) : invite.role}
                      {invite.invitedByName
                        ? t("auth.welcome.invitedBy", { name: invite.invitedByName })
                        : ""}
                    </p>
                  </div>
                  <form action={acceptPendingInvite.bind(null, invite.id)}>
                    <Button type="submit" size="sm">
                      {t("auth.welcome.join")}
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className={invites.length > 0 ? "space-y-3 border-t pt-5" : "space-y-3"}>
          <p className="text-sm font-medium">{t("auth.welcome.own.title")}</p>
          <form action={createMyHousehold} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="household-name">{t("auth.welcome.own.nameLabel")}</Label>
              <Input
                id="household-name"
                name="name"
                placeholder={t("auth.welcome.own.namePlaceholder")}
                maxLength={60}
                autoComplete="off"
              />
            </div>
            <Button type="submit" className="w-full">
              {t("auth.welcome.own.action")}
            </Button>
          </form>
        </div>

        <div className="border-t pt-5">
          <p className="pb-3 text-xs text-muted-foreground">
            {t("auth.welcome.signOut.body")}
          </p>
          <form action={signOutFromWelcome}>
            <Button type="submit" variant="ghost" className="w-full">
              {t("nav.signOut")}
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
