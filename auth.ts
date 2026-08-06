// Auth.js v5 configuration
// Docs: https://authjs.dev/getting-started/installation

import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";
import { isEmailAllowed } from "@/lib/auth/allowed-emails";
import { isSignupAllowed } from "@/lib/auth/signup-policy";
import {
  hasActiveInviteByEmail,
  hasHouseholdAccessByEmail,
} from "@/lib/household/access";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  redirectProxyUrl: process.env.AUTH_REDIRECT_PROXY_URL,
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  ],
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    // Two independent gates, both fail-closed on their own axis:
    //
    // 1) ALLOWED_EMAILS — who may authenticate at all (app + MCP, which shares
    //    the login). Comma-separated; exact addresses, domains or wildcards;
    //    matching in `lib/auth/allowed-emails.ts` (pure, unit-tested). Unset
    //    keeps sign-in open on this axis (historical default).
    //
    // 2) Signup policy — whether sign-in may CREATE a user. The Prisma adapter
    //    auto-provisions a User row on first sign-in, making login and
    //    registration the same door; with ALLOW_SIGNUP unset (the default,
    //    `lib/auth/signup-policy.ts`) sign-in only matches users that already
    //    exist in the database, so registration is closed no matter what the
    //    allowlist says. Set ALLOW_SIGNUP=true only to bootstrap a fresh
    //    database (first login has no row to match), then turn it back off.
    // Household invitations (PLAN_MULTIUSER.md §7) are an ADDITIVE third way
    // through both gates: a live invite or an existing membership passes gate
    // 1 when the allowlist misses, and a live invite authorizes the user-row
    // creation gate 2 would otherwise refuse. Nothing existing is loosened —
    // no invite, no change.
    async signIn({ profile, user }) {
      const email = profile?.email ?? user?.email;
      if (!isEmailAllowed(email, process.env.ALLOWED_EMAILS)) {
        if (!email || !(await hasHouseholdAccessByEmail(email))) return false;
      }
      if (isSignupAllowed(process.env.ALLOW_SIGNUP)) return true;
      if (!email) return false;
      const existing = await prisma.user.findFirst({
        // Case-insensitive: Google normalizes to lowercase, but a hand-seeded
        // or imported row may not be, and a case mismatch here means lockout.
        where: { email: { equals: email, mode: "insensitive" } },
        select: { id: true },
      });
      if (existing !== null) return true;
      return hasActiveInviteByEmail(email);
    },
    // Expose user.id in the session object
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
});
