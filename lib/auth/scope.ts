// IO half of the household access model (PLAN_MULTIUSER.md §5). Resolves
// session → membership → household → the userId every domain query filters by.
//
// THE multi-user rule (ARCHITECTURE.md → "Multi-User Data Isolation") is
// unchanged: all domain data hangs off ONE userId derived server-side. What
// this module changes is WHICH userId that is: the household owner's
// (`dataUserId`), which is no longer necessarily the signed-in user
// (`actorUserId`) once invited members exist. Domain reads/writes use
// `dataUserId`; personal things (prefs split lands in phase 5, audit trail,
// OAuth grants) use `actorUserId`.

import "server-only";
import { cache } from "react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { roleAllows, type ScopeLevel } from "@/lib/auth/roles";
import type { HouseholdRole } from "@/app/generated/prisma";

export interface Scope {
  /**
   * The userId that anchors ALL of the household's data (the owner's
   * User.id). Every domain query filters by this — never by `actorUserId`.
   */
  dataUserId: string;
  /** The signed-in member doing the acting (their own User.id). */
  actorUserId: string;
  role: HouseholdRole;
  householdId: string;
  /** Display identity of the actor, for the shell/greetings. */
  actor: { name: string | null; email: string | null; image: string | null };
}

/**
 * Resolves the current session's scope, or null when unauthenticated.
 * Wrapped in React `cache()` so layout + page + nested calls within one
 * request share a single resolution.
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

  const membership = await prisma.householdMember.findUnique({
    where: { userId },
    select: {
      role: true,
      household: { select: { id: true, ownerUserId: true } },
    },
  });

  if (membership) {
    return {
      dataUserId: membership.household.ownerUserId,
      actorUserId: userId,
      role: membership.role,
      householdId: membership.household.id,
      actor,
    };
  }

  // Lazy bootstrap: a signed-in user without a membership owns a fresh
  // household. Covers the ALLOW_SIGNUP bootstrap path and any row the
  // backfill migration could not have seen. Invited members never pass
  // through here — their membership is created when they accept (phase 2).
  const household = await ensureOwnHousehold(userId);
  return {
    dataUserId: userId,
    actorUserId: userId,
    role: "OWNER",
    householdId: household.id,
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

async function ensureOwnHousehold(userId: string): Promise<{ id: string }> {
  // Race-safe: the unique constraints make a concurrent first-request lose
  // cleanly; on conflict we re-read the winner's row.
  try {
    return await prisma.household.create({
      data: {
        name: "My household",
        ownerUserId: userId,
        members: { create: { userId, role: "OWNER" } },
      },
      select: { id: true },
    });
  } catch {
    const existing = await prisma.householdMember.findUnique({
      where: { userId },
      select: { householdId: true },
    });
    if (!existing) throw new Error("Failed to resolve household");
    return { id: existing.householdId };
  }
}
