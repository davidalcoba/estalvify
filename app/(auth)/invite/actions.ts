"use server";

// Accepting a household invitation (PLAN_MULTIUSER.md §6). Lives under
// app/(auth) on purpose: the actor may have NO household yet (or only the
// lazy bootstrap one), so this is an actor-identity surface like login and
// the OAuth consent — it uses the session directly, not requireScope.

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { acceptHouseholdInvite } from "@/lib/household/manage";

export async function acceptInvite(token: string): Promise<void> {
  const session = await auth();
  if (!session?.user) redirect(`/login?callbackUrl=/invite/${token}`);

  const result = await acceptHouseholdInvite(token, {
    userId: session.user.id,
    email: session.user.email,
  });

  if (!result.ok) {
    redirect(`/invite/${token}?error=${result.reason}`);
  }
  redirect("/dashboard?joined=true");
}
