// Household membership management (PLAN_MULTIUSER.md §6, phase 2). All
// functions are parameterized by householdId — the caller passes it from its
// resolved Scope, so nothing here trusts client input for tenancy.

import "server-only";
import { prisma } from "@/lib/prisma";
import { generateOpaqueToken, hashToken } from "@/lib/mcp/oauth";
import { revokeUserAccess } from "@/lib/auth/revoke";
import type { HouseholdRole } from "@/app/generated/prisma";
import {
  inviteExpiryFrom,
  isInvitableRole,
  normalizeEmail,
  validateInviteForAcceptance,
  type InviteRejection,
} from "@/lib/household/invite";

// ─────────────────────────────────────────────
// Listing (server → client DTO)
// ─────────────────────────────────────────────

export interface HouseholdMemberDTO {
  id: string;
  userId: string;
  name: string | null;
  email: string | null;
  role: HouseholdRole;
  joinedAt: string; // ISO
}

export interface HouseholdInviteDTO {
  id: string;
  email: string;
  role: HouseholdRole;
  expiresAt: string; // ISO
  expired: boolean;
}

export interface HouseholdPeople {
  householdName: string;
  members: HouseholdMemberDTO[];
  invites: HouseholdInviteDTO[];
}

export async function listHouseholdPeople(
  householdId: string
): Promise<HouseholdPeople> {
  const household = await prisma.household.findUnique({
    where: { id: householdId },
    select: {
      name: true,
      members: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          userId: true,
          role: true,
          createdAt: true,
          user: { select: { name: true, email: true } },
        },
      },
      invites: {
        // Pending only: accepted invites live on as members, revoked ones are
        // noise. Expired ones stay visible (flagged) so they can be renewed.
        where: { acceptedAt: null, revokedAt: null },
        orderBy: { createdAt: "desc" },
        select: { id: true, email: true, role: true, expiresAt: true },
      },
    },
  });
  if (!household) throw new Error("Household not found");

  const now = Date.now();
  return {
    householdName: household.name,
    members: household.members.map((m) => ({
      id: m.id,
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
      joinedAt: m.createdAt.toISOString(),
    })),
    invites: household.invites.map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role,
      expiresAt: i.expiresAt.toISOString(),
      expired: i.expiresAt.getTime() <= now,
    })),
  };
}

// ─────────────────────────────────────────────
// Invites
// ─────────────────────────────────────────────

/**
 * Creates (or renews) an invitation and returns the RAW token — the only
 * moment it exists in the clear; the row stores its hash. Any previous
 * pending invite for the same email is revoked, so "invite again" always
 * yields exactly one live link per address.
 */
export async function createHouseholdInvite(
  householdId: string,
  invitedByUserId: string,
  rawEmail: string,
  role: string
): Promise<{ token: string; expiresAt: Date }> {
  const email = normalizeEmail(rawEmail);
  if (!email || !email.includes("@")) throw new Error("Enter a valid email");
  if (!isInvitableRole(role)) throw new Error("Invalid role");

  const existingMember = await prisma.householdMember.findFirst({
    where: {
      householdId,
      user: { email: { equals: email, mode: "insensitive" } },
    },
    select: { id: true },
  });
  if (existingMember) throw new Error("Already a member of this household");

  const token = generateOpaqueToken();
  const expiresAt = inviteExpiryFrom(new Date());

  await prisma.$transaction([
    prisma.householdInvite.updateMany({
      where: {
        householdId,
        email: { equals: email, mode: "insensitive" },
        acceptedAt: null,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    }),
    prisma.householdInvite.create({
      data: {
        householdId,
        email,
        role,
        tokenHash: hashToken(token),
        invitedByUserId,
        expiresAt,
      },
    }),
  ]);

  return { token, expiresAt };
}

export async function revokeHouseholdInvite(
  householdId: string,
  inviteId: string
): Promise<void> {
  await prisma.householdInvite.updateMany({
    where: { id: inviteId, householdId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

// ─────────────────────────────────────────────
// Members
// ─────────────────────────────────────────────

export async function changeHouseholdMemberRole(
  householdId: string,
  memberId: string,
  role: string
): Promise<void> {
  // Only EDITOR/VIEWER are assignable: the OWNER role is the data anchor and
  // never changes hands here (transfer is phase 6 of the plan).
  if (!isInvitableRole(role)) throw new Error("Invalid role");

  const member = await prisma.householdMember.findFirst({
    where: { id: memberId, householdId },
    select: { role: true },
  });
  if (!member) throw new Error("Member not found");
  if (member.role === "OWNER") throw new Error("The owner's role cannot change");

  await prisma.householdMember.update({
    where: { id: memberId },
    data: { role },
  });
}

/**
 * Removes a member and cuts their access NOW (sessions + MCP refresh tokens,
 * via revokeUserAccess) — same immediacy as removal from ALLOWED_EMAILS. On
 * their next sign-in, if the gates still admit them, they bootstrap a fresh
 * empty household of their own.
 */
export async function removeHouseholdMember(
  householdId: string,
  memberId: string
): Promise<void> {
  const member = await prisma.householdMember.findFirst({
    where: { id: memberId, householdId },
    select: { role: true, userId: true },
  });
  if (!member) throw new Error("Member not found");
  if (member.role === "OWNER") throw new Error("The owner cannot be removed");

  await prisma.householdMember.delete({ where: { id: memberId } });
  await revokeUserAccess(member.userId);
}

// ─────────────────────────────────────────────
// Acceptance
// ─────────────────────────────────────────────

export type AcceptRejection =
  | InviteRejection
  | "already_in_household"
  | "own_household_has_data";

export type AcceptResult =
  | { ok: true; householdName: string }
  | { ok: false; reason: AcceptRejection };

export async function findInviteForToken(rawToken: string) {
  return prisma.householdInvite.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      invitedByUserId: true,
      household: { select: { id: true, name: true, ownerUserId: true } },
    },
  });
}

/** Whether any domain row hangs off this userId (as a data scope). */
export async function userHasDomainData(userId: string): Promise<boolean> {
  const [connections, transactions, categories, rules, series, planned, budgets] =
    await Promise.all([
      prisma.bankConnection.count({ where: { userId } }),
      prisma.transaction.count({ where: { userId } }),
      prisma.category.count({ where: { userId } }),
      prisma.categoryRule.count({ where: { userId } }),
      prisma.recurringSeries.count({ where: { userId } }),
      prisma.plannedItem.count({ where: { userId } }),
      prisma.budget.count({ where: { userId } }),
    ]);
  return (
    connections + transactions + categories + rules + series + planned + budgets >
    0
  );
}

/**
 * Accepts an invite for the signed-in actor. The only self-service migration
 * allowed in v1: an actor who owns a still-EMPTY household (the lazy
 * bootstrap, or a fresh sign-up) drops it and joins the inviting one. An
 * owner with data, or a member of another household, is rejected — moving
 * data between households is explicitly out of scope.
 */
export async function acceptHouseholdInvite(
  rawToken: string,
  actor: { userId: string; email: string | null | undefined }
): Promise<AcceptResult> {
  const invite = await findInviteForToken(rawToken);
  const validation = validateInviteForAcceptance(invite, actor.email, new Date());
  if (!validation.ok) return { ok: false, reason: validation.reason };
  // validateInviteForAcceptance returned ok, so invite is non-null.
  const found = invite!;

  const membership = await prisma.householdMember.findUnique({
    where: { userId: actor.userId },
    select: {
      id: true,
      role: true,
      householdId: true,
      household: { select: { _count: { select: { members: true } } } },
    },
  });

  if (membership?.householdId === found.household.id) {
    // Already in — mark the invite used and succeed idempotently.
    await prisma.householdInvite.update({
      where: { id: found.id },
      data: { acceptedAt: new Date() },
    });
    return { ok: true, householdName: found.household.name };
  }

  if (membership) {
    const soleOwner =
      membership.role === "OWNER" && membership.household._count.members === 1;
    if (!soleOwner) return { ok: false, reason: "already_in_household" };
    if (await userHasDomainData(actor.userId)) {
      return { ok: false, reason: "own_household_has_data" };
    }
  }

  await prisma.$transaction(async (tx) => {
    if (membership) {
      // Their own empty bootstrap household — cascades the membership away.
      await tx.household.delete({ where: { id: membership.householdId } });
    }
    await tx.householdMember.create({
      data: {
        householdId: found.household.id,
        userId: actor.userId,
        role: found.role,
      },
    });
    await tx.householdInvite.update({
      where: { id: found.id },
      data: { acceptedAt: new Date() },
    });
  });

  return { ok: true, householdName: found.household.name };
}
