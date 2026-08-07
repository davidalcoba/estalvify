"use server";

// Layout-level actions (the app shell, not a specific route).

import { redirect } from "next/navigation";
import { requireScope, setActiveHouseholdCookie } from "@/lib/auth/scope";

/**
 * Switch the acting member's ACTIVE household (phase 6-lite). Validated
 * against their own memberships — the cookie is a preference, never an
 * access grant; getScope re-checks membership on every request anyway.
 */
export async function switchHousehold(householdId: string): Promise<void> {
  const scope = await requireScope("read");
  if (!scope.households.some((h) => h.id === householdId)) {
    throw new Error("Not a member of that household");
  }
  await setActiveHouseholdCookie(householdId);
  redirect("/dashboard");
}
