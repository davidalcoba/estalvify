// Login page — Google OAuth
// Redirects to /dashboard after successful sign-in
//
// Deliberately bare: the logo, one button, and the legal line. There is no
// pitch and no explanation here — a sign-in screen is a door, not a page, and
// everything else that was tried on it (a headline, feature points, a security
// note) only made the one thing you can do harder to find.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth, signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LogoMark } from "@/components/brand/logo";
import { GoogleIcon } from "@/components/brand/google-icon";
import { getT } from "@/lib/i18n/server";
import { RichText } from "@/components/i18n/rich-text";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("auth.login.metaTitle") };
}

/**
 * Only allow same-origin relative paths as post-login destinations, to prevent
 * open-redirects. Anything else falls back to the dashboard. Used by the MCP
 * OAuth authorize flow, which sends unauthenticated users here with a
 * `callbackUrl` pointing back at `/api/oauth/authorize`.
 */
function safeCallbackPath(raw?: string): string {
  if (!raw) return "/dashboard";
  // Must be a relative path ("/x"), not protocol-relative ("//x") or absolute.
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  return raw;
}

export default async function LoginPage(props: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const session = await auth();
  const t = await getT();
  const { callbackUrl } = await props.searchParams;
  const destination = safeCallbackPath(callbackUrl);

  // Already authenticated → go straight to the intended destination
  if (session?.user) {
    redirect(destination);
  }

  return (
    <Card className="w-full max-w-sm shadow-lg">
      <CardContent className="flex flex-col items-center gap-6 py-8">
        <LogoMark className="size-12 rounded-xl" />

        {/* The screen has no visible heading by design; a page still needs one,
            and a screen reader announcing "Estalvify — sign in" is the whole
            context a blind user gets here. */}
        <h1 className="sr-only">{t("auth.login.metaTitle")}</h1>

        <form
          action={async () => {
            "use server";
            const headersList = await headers();
            const host = headersList.get("x-forwarded-host") ?? headersList.get("host") ?? "";
            const proto = headersList.get("x-forwarded-proto") ?? "https";
            await signIn("google", { redirectTo: `${proto}://${host}${destination}` });
          }}
        >
          {/* Sized to its label, not to the card: a button stretched edge to
              edge reads as a banner and loses the shape a button has. */}
          <Button type="submit" variant="outline" className="h-11 gap-2 px-6">
            <GoogleIcon />
            {t("auth.login.google")}
          </Button>
        </form>

        <p className="text-center text-xs text-balance text-muted-foreground">
          <RichText
            template={t("auth.login.legal")}
            slots={{
              terms: (
                <Link href="/terms" className="underline hover:text-foreground">
                  {t("auth.login.terms")}
                </Link>
              ),
              privacy: (
                <Link href="/privacy" className="underline hover:text-foreground">
                  {t("auth.login.privacy")}
                </Link>
              ),
            }}
          />
        </p>
      </CardContent>
    </Card>
  );
}
