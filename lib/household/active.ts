// Active-membership resolution for surfaces that must NOT use getScope —
// the OAuth consent flow runs for users who may have no membership at all,
// and getScope would bounce them to /welcome mid-flow. Same rule as
// lib/auth/scope.ts: the cookie picks among the user's memberships, oldest
// first as the fallback; the cookie is a preference, never an access grant.

import "server-only";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { ACTIVE_HOUSEHOLD_COOKIE } from "@/lib/auth/scope";

export async function resolveActiveMembership(userId: string) {
  const wanted = (await cookies()).get(ACTIVE_HOUSEHOLD_COOKIE)?.value;
  const memberships = await prisma.householdMember.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: {
      role: true,
      householdId: true,
      household: { select: { name: true, ownerUserId: true } },
    },
  });
  if (memberships.length === 0) return null;
  return memberships.find((m) => m.householdId === wanted) ?? memberships[0];
}
