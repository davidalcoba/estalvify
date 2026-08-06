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

export type AcceptRejection = InviteRejection;

export type AcceptResult =
  | { ok: true; householdId: string; householdName: string }
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

type LoadedInvite = NonNullable<Awaited<ReturnType<typeof findInviteForToken>>>;

/**
 * Membership creation shared by both acceptance paths. Since phase 6-lite a
 * user can belong to several households, so accepting simply ADDS a
 * membership — nothing is deleted, rejected or migrated. Idempotent when the
 * membership already exists.
 */
async function finalizeAcceptance(
  invite: LoadedInvite,
  actorUserId: string
): Promise<AcceptResult> {
  const existing = await prisma.householdMember.findFirst({
    where: { householdId: invite.household.id, userId: actorUserId },
    select: { id: true },
  });

  await prisma.$transaction(async (tx) => {
    if (!existing) {
      await tx.householdMember.create({
        data: {
          householdId: invite.household.id,
          userId: actorUserId,
          role: invite.role,
        },
      });
    }
    await tx.householdInvite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    });
  });

  return {
    ok: true,
    householdId: invite.household.id,
    householdName: invite.household.name,
  };
}

/** Accepts an invite link (raw token) for the signed-in actor. */
export async function acceptHouseholdInvite(
  rawToken: string,
  actor: { userId: string; email: string | null | undefined }
): Promise<AcceptResult> {
  const invite = await findInviteForToken(rawToken);
  const validation = validateInviteForAcceptance(invite, actor.email, new Date());
  if (!validation.ok) return { ok: false, reason: validation.reason };
  return finalizeAcceptance(invite!, actor.userId);
}

/**
 * Accepts a pending invite BY ID from /welcome — the raw token only lives in
 * the link, but the email-must-match rule gives the same guarantee: only the
 * invited account can accept, token in hand or not.
 */
export async function acceptInviteByIdForEmail(
  inviteId: string,
  actor: { userId: string; email: string | null | undefined }
): Promise<AcceptResult> {
  const invite = await prisma.householdInvite.findUnique({
    where: { id: inviteId },
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
  const validation = validateInviteForAcceptance(invite, actor.email, new Date());
  if (!validation.ok) return { ok: false, reason: validation.reason };
  return finalizeAcceptance(invite!, actor.userId);
}

// ─────────────────────────────────────────────
// Households (create / rename / pending invites)
// ─────────────────────────────────────────────

/**
 * Explicit household creation (the /welcome flow and nothing else — signing
 * in never creates one as a side effect). Race-safe via the unique
 * constraint on ownerUserId; on conflict the winner's row is returned.
 */
export async function createOwnHousehold(
  userId: string,
  rawName: string
): Promise<{ id: string }> {
  const name = rawName.trim().slice(0, 60) || "My household";
  try {
    return await prisma.household.create({
      data: {
        name,
        ownerUserId: userId,
        members: { create: { userId, role: "OWNER" } },
      },
      select: { id: true },
    });
  } catch {
    const existing = await prisma.household.findUnique({
      where: { ownerUserId: userId },
      select: { id: true },
    });
    if (!existing) throw new Error("Failed to create household");
    return existing;
  }
}

export async function renameHousehold(
  householdId: string,
  rawName: string
): Promise<void> {
  const name = rawName.trim().slice(0, 60);
  if (!name) throw new Error("Name is required");
  await prisma.household.update({ where: { id: householdId }, data: { name } });
}

export interface PendingInviteDTO {
  id: string;
  householdName: string;
  role: HouseholdRole;
  invitedByName: string | null;
}

/** Live invitations addressed to this email (for /welcome). */
export async function listPendingInvitesForEmail(
  email: string | null | undefined
): Promise<PendingInviteDTO[]> {
  if (!email) return [];
  const invites = await prisma.householdInvite.findMany({
    where: {
      email: { equals: email, mode: "insensitive" },
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      role: true,
      invitedByUserId: true,
      household: { select: { name: true } },
    },
  });
  if (invites.length === 0) return [];
  const inviters = await prisma.user.findMany({
    where: { id: { in: invites.map((i) => i.invitedByUserId) } },
    select: { id: true, name: true, email: true },
  });
  const inviterById = new Map(inviters.map((u) => [u.id, u.name ?? u.email]));
  return invites.map((i) => ({
    id: i.id,
    householdName: i.household.name,
    role: i.role,
    invitedByName: inviterById.get(i.invitedByUserId) ?? null,
  }));
}
