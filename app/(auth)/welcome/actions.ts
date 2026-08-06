"use server";

// /welcome actions (PLAN_MULTIUSER.md phase 6-lite). Actor-identity surface
// like login and the invite page: the user may have NO household yet, so
// these use the session directly, never requireScope (which would bounce
// them right back here).

import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import {
  acceptInviteByIdForEmail,
  createOwnHousehold,
} from "@/lib/household/manage";
import { setActiveHouseholdCookie } from "@/lib/auth/scope";

export async function createMyHousehold(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/welcome");

  const name = String(formData.get("name") ?? "");
  const { id } = await createOwnHousehold(session.user.id, name);
  await setActiveHouseholdCookie(id);
  redirect("/dashboard");
}

export async function acceptPendingInvite(inviteId: string): Promise<void> {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/welcome");

  const result = await acceptInviteByIdForEmail(inviteId, {
    userId: session.user.id,
    email: session.user.email,
  });
  if (!result.ok) {
    redirect(`/welcome?error=${result.reason}`);
  }
  await setActiveHouseholdCookie(result.householdId);
  redirect("/dashboard");
}

export async function signOutFromWelcome(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
