// Login page — Google OAuth
// Redirects to /dashboard after successful sign-in
//
// Laid out as a company front door rather than a lone dialog: on a wide screen
// the product states what it is on the left and the sign-in sits on the right;
// on a phone the same material stacks — name, promise, card, proof. The claims
// on the left are load-bearing, not decoration: this is where someone decides
// whether to connect a bank account, so `components/auth/product-points.tsx`
// only says things the app actually does.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { ShieldCheck } from "lucide-react";
import { auth, signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/brand/logo";
import { GoogleIcon } from "@/components/brand/google-icon";
import { ProductPoints } from "@/components/auth/product-points";
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
    // One column on a phone, two from lg. The columns are placed explicitly
    // rather than nested, so the pitch can wrap around the card on a wide
    // screen and still stack in reading order — name, promise, sign-in,
    // proof — on a narrow one, with no markup rendered twice.
    <div className="flex w-full max-w-5xl flex-col gap-8 lg:grid lg:grid-cols-[1fr_23rem] lg:gap-x-16 lg:gap-y-10">
      <header className="space-y-4 lg:col-start-1 lg:row-start-1 lg:self-end">
        <Logo className="lg:mb-8" markClassName="size-9 rounded-xl" />
        <h1 className="text-3xl font-bold tracking-tight text-balance lg:text-4xl">
          {t("auth.login.title")}
        </h1>
        <p className="max-w-lg text-base text-muted-foreground text-pretty">
          {t("auth.login.subtitle")}
        </p>
      </header>

      <Card className="shadow-lg lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center">
        {/* No logo inside the card at any width: the lockup sits above it on a
            phone and beside it on a desktop, and a second mark two rows down
            read as two brands rather than one. */}
        <CardHeader className="space-y-1.5">
          <CardTitle className="text-xl font-semibold tracking-tight">
            {t("auth.login.signIn.title")}
          </CardTitle>
          <CardDescription>{t("auth.login.signIn.subtitle")}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <form
            action={async () => {
              "use server";
              const headersList = await headers();
              const host = headersList.get("x-forwarded-host") ?? headersList.get("host") ?? "";
              const proto = headersList.get("x-forwarded-proto") ?? "https";
              await signIn("google", { redirectTo: `${proto}://${host}${destination}` });
            }}
          >
            <Button type="submit" variant="outline" className="h-11 w-full gap-2">
              <GoogleIcon />
              {t("auth.login.google")}
            </Button>
          </form>

          {/* Said plainly rather than left to be discovered: one button and no
              password field reads as a missing form until you know why. */}
          <p className="text-center text-xs text-muted-foreground">
            {t("auth.login.googleOnly")}
          </p>

          <div className="flex gap-2 rounded-lg border bg-muted/40 p-3">
            <ShieldCheck className="mt-px size-4 shrink-0 text-success" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("auth.login.security")}
            </p>
          </div>

          <p className="text-center text-xs text-muted-foreground">
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

      <ProductPoints className="lg:col-start-1 lg:row-start-2 lg:self-start" />
    </div>
  );
}
