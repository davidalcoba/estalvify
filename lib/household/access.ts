// The invite-aware side of the entry gates (PLAN_MULTIUSER.md §7).
//
// auth.ts (signIn) and proxy.ts consult these when the ALLOWED_EMAILS
// allowlist does NOT match: an active membership or a live invitation is the
// additive third way in. Both queries run only on that exceptional path, so
// the common request still costs the proxy nothing extra.

import { prisma } from "@/lib/prisma";

export async function hasMembershipByEmail(
  email: string | null | undefined
): Promise<boolean> {
  if (!email) return false;
  const member = await prisma.householdMember.findFirst({
    where: { user: { email: { equals: email, mode: "insensitive" } } },
    select: { id: true },
  });
  return member !== null;
}

/** A pending, unexpired, unrevoked invitation for this email. */
export async function hasActiveInviteByEmail(
  email: string | null | undefined
): Promise<boolean> {
  if (!email) return false;
  const invite = await prisma.householdInvite.findFirst({
    where: {
      email: { equals: email, mode: "insensitive" },
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });
  return invite !== null;
}

/** Membership OR live invite — what the gates accept beside the allowlist. */
export async function hasHouseholdAccessByEmail(
  email: string | null | undefined
): Promise<boolean> {
  if (!email) return false;
  return (
    (await hasMembershipByEmail(email)) || (await hasActiveInviteByEmail(email))
  );
}
