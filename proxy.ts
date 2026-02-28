// Route protection proxy (Next.js 16 — renamed from middleware.ts)
// Unauthenticated users are redirected to /login
// Protected by Auth.js session check

import { auth } from "@/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  const session = await auth();
  const { pathname } = request.nextUrl;

  // Public routes that don't need auth
  const isPublicPath =
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/cron") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/manifest") ||
    pathname.startsWith("/sw.js") ||
    pathname.startsWith("/icons");

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
