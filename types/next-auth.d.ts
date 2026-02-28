// Extend Auth.js session types to include user.id
// Without this, TypeScript won't know about session.user.id

import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}
