// Auth.js v5 configuration
// Docs: https://authjs.dev/getting-started/installation

import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";

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
    // only those Google accounts may authenticate — this locks both the app and
    // the MCP API (which delegates to the same login) to the owner. When unset,
    // sign-in stays open (previous behaviour).
    signIn({ profile, user }) {
      const allowed = (process.env.ALLOWED_EMAILS ?? "")
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
      if (allowed.length === 0) return true;
      const email = (profile?.email ?? user?.email ?? "").toLowerCase();
      return email.length > 0 && allowed.includes(email);
    },
    // Expose user.id in the session object
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
});
