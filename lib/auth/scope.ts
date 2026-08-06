// IO half of the household access model (PLAN_MULTIUSER.md §5). Resolves
// session → membership → household → the userId every domain query filters by.
//
// THE multi-user rule (ARCHITECTURE.md → "Multi-User Data Isolation") is
// unchanged: all domain data hangs off ONE userId derived server-side. What
// this module changes is WHICH userId that is: the ACTIVE household's owner
// (`dataUserId`), which is no longer necessarily the signed-in user
// (`actorUserId`) once invited members exist. Domain reads/writes use
// `dataUserId`; personal things (prefs, notification reads, audit, OAuth
// grants) use `actorUserId`.
//
// Since phase 6-lite a user can belong to SEVERAL households: the active one
// comes from a cookie (set by the sidebar switcher / invite acceptance),
// falling back to the oldest membership. A signed-in user with NO membership
// is redirected to /welcome — household creation is EXPLICIT there; nothing
// is ever created as a side effect of signing in (someone opening an invite
// link may not want an account of their own at all).

import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { roleAllows, type ScopeLevel } from "@/lib/auth/roles";
import type { HouseholdRole } from "@/app/generated/prisma";

/** Cookie holding the id of the member's active household. */
export const ACTIVE_HOUSEHOLD_COOKIE = "estalvify.hh";

export interface HouseholdSummary {
  id: string;
  name: string;
  role: HouseholdRole;
}

export interface Scope {
  /**
   * The userId that anchors ALL of the active household's data (its owner's
   * User.id). Every domain query filters by this — never by `actorUserId`.
   */
  dataUserId: string;
  /** The signed-in member doing the acting (their own User.id). */
  actorUserId: string;
  role: HouseholdRole;
  householdId: string;
  householdName: string;
  /** Every household the member belongs to (oldest first) — the switcher. */
  households: HouseholdSummary[];
  /** Display identity of the actor, for the shell/greetings. */
  actor: { name: string | null; email: string | null; image: string | null };
}

/**
 * Resolves the current session's scope, or null when unauthenticated.
 * Redirects to /welcome when the session has no household membership at all
 * (that page must therefore never call this). Wrapped in React `cache()` so
 * layout + page + nested calls within one request share a single resolution.
 */
export const getScope = cache(async (): Promise<Scope | null> => {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const actor = {
    name: session?.user?.name ?? null,
    email: session?.user?.email ?? null,
    image: session?.user?.image ?? null,
  };

  const memberships = await prisma.householdMember.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: {
      role: true,
      household: { select: { id: true, name: true, ownerUserId: true } },
    },
  });

  if (memberships.length === 0) {
    // Nothing in the app can render without a data scope. Creation is an
    // explicit choice on /welcome — never a sign-in side effect.
    redirect("/welcome");
  }

  const wanted = (await cookies()).get(ACTIVE_HOUSEHOLD_COOKIE)?.value;
  const active =
    memberships.find((m) => m.household.id === wanted) ?? memberships[0];

  return {
    dataUserId: active.household.ownerUserId,
    actorUserId: userId,
    role: active.role,
    householdId: active.household.id,
    householdName: active.household.name,
    households: memberships.map((m) => ({
      id: m.household.id,
      name: m.household.name,
      role: m.role,
    })),
    actor,
  };
});

/**
 * The one auth gate for pages, server actions and API routes: returns the
 * scope or throws. "Unauthorized" (no session) and "Forbidden" (role below
 * the required level) are distinct on purpose — the first means log in, the
 * second means this member may not do this.
 */
export async function requireScope(level: ScopeLevel): Promise<Scope> {
  const scope = await getScope();
  if (!scope) throw new Error("Unauthorized");
  if (!roleAllows(scope.role, level)) throw new Error("Forbidden");
  return scope;
}

/** Persist the active-household choice (validated by the caller). */
export async function setActiveHouseholdCookie(householdId: string): Promise<void> {
  (await cookies()).set(ACTIVE_HOUSEHOLD_COOKIE, householdId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}