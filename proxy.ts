// Route protection proxy (Next.js 16 — renamed from middleware.ts)
// Unauthenticated users are redirected to /login
// Protected by Auth.js session check

import { auth } from "@/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isEmailAllowed } from "@/lib/auth/allowed-emails";
import { revokeUserAccess } from "@/lib/auth/revoke";

export async function proxy(request: NextRequest) {
  const session = await auth();
  const { pathname } = request.nextUrl;

  // TEMPORARY DIAGNOSTIC — log the proxy's view of server-action POSTs.
  if (request.headers.get("next-action")) {
    try {
      const { prisma } = await import("@/lib/prisma");
      await prisma.syncLog.create({
        data: {
          status: "FAILED",
          syncDate: new Date(),
          errorMessage:
            `PROXYDBG method=${request.method} path=${pathname} ` +
            `hasSession=${!!session?.user} email=${session?.user?.email ?? "-"} ` +
            `allowed=${session?.user ? isEmailAllowed(session.user.email, process.env.ALLOWED_EMAILS) : "n/a"} ` +
            `ALLOWED_EMAILS_set=${!!process.env.ALLOWED_EMAILS}`,
        },
      });
    } catch {
      /* best-effort */
    }
  }

  // Enforce ALLOWED_EMAILS on LIVE sessions, not just at sign-in. Sign-in is
  // the only place Auth.js consults the allowlist, so without this a removed
  // user keeps a working 30-day session. The check is pure string matching —
  // no extra query — and the revocation (delete the DB session rows, revoke
  // MCP refresh tokens) only runs in the already-exceptional disallowed case.
  // With the session rows gone, the next request carries a cookie that
  // resolves to nothing, so this cannot loop.
  if (
    session?.user &&
    !isEmailAllowed(session.user.email, process.env.ALLOWED_EMAILS)
  ) {
    await revokeUserAccess(session.user.id);
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Public routes that don't need an Auth.js session.
  const isPublicPath =
    pathname.startsWith("/login") ||
    // Legal pages must be readable BEFORE signing in — the login screen links
    // to them as the terms the user accepts.
    pathname === "/privacy" ||
    pathname === "/terms" ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/cron") ||
    pathname.startsWith("/api/banking/callback") ||
    // MCP API: the endpoint enforces its own bearer-token auth (returns 401 with
    // OAuth discovery metadata), and the OAuth Authorization Server endpoints must
    // be reachable without a session so MCP clients can discover, register, and
    // complete the flow. /api/oauth/authorize does its own session check and
    // redirects to /login with a callbackUrl when needed.
    pathname.startsWith("/api/mcp") ||
    pathname.startsWith("/api/oauth") ||
    pathname.startsWith("/.well-known") ||
    pathname.startsWith("/_next") ||
    // Brand assets. `app/icon.svg` and `app/apple-icon.png` are served as App
    // Router routes rather than from `public/`, so they pass through here — a
    // logged-out visitor must still resolve them or the login screen, which is
    // the one page they see, has no icon.
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/icon") || // /icon.svg and /icons/*
    pathname.startsWith("/apple-icon") ||
    pathname.startsWith("/logo") ||
    pathname.startsWith("/manifest") ||
    pathname.startsWith("/sw.js");

  if (!session?.user && !isPublicPath) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (session?.user && pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
