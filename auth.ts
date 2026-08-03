// Auth.js v5 configuration
// Docs: https://authjs.dev/getting-started/installation

import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";
import { isEmailAllowed } from "@/lib/auth/allowed-emails";

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
    // Restrict who can sign in. When ALLOWED_EMAILS is set (comma-separated),
    // only matching Google accounts may authenticate — this locks both the app
    // and the MCP API (which delegates to the same login) to the owner. When
    // unset, sign-in stays open (previous behaviour). Entries can be exact
    // addresses, whole domains, or wildcards; the matching rules live in
    // `lib/auth/allowed-emails.ts`, which is pure and unit-tested.
    signIn({ profile, user }) {
      return isEmailAllowed(
        profile?.email ?? user?.email,
        process.env.ALLOWED_EMAILS,
      );
    },
    // Expose user.id in the session object
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
});
