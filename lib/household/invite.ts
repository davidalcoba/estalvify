// Pure invitation logic (PLAN_MULTIUSER.md §6). IO lives in
// lib/household/manage.ts; the gates consult lib/household/access.ts.
//
// An invite is a copyable link whose raw token is shown once at creation and
// stored only as a hash (same pattern as MCP auth codes). Acceptance requires
// the SESSION email to match the invited email — the token alone must not
// grant access, or a forwarded link would admit a third party.

import type { HouseholdRole } from "@/app/generated/prisma";

export const INVITE_TTL_DAYS = 7;

// OWNER is never invitable: the owner is the data anchor, fixed at household
// creation (transfer is phase 6).
export const INVITABLE_ROLES = ["EDITOR", "VIEWER"] as const satisfies
  readonly HouseholdRole[];
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export function isInvitableRole(role: string): role is InvitableRole {
  return (INVITABLE_ROLES as readonly string[]).includes(role);
}

/** Same normalization signIn applies: emails compare case-insensitively. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function emailsMatch(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  if (!a || !b) return false;
  return normalizeEmail(a) === normalizeEmail(b);
}

export function inviteExpiryFrom(now: Date): Date {
  return new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export interface InviteRecord {
  email: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
}

export type InviteRejection =
  | "not_found"
  | "revoked"
  | "already_accepted"
  | "expired"
  | "email_mismatch";

export type InviteValidation =
  | { ok: true }
  | { ok: false; reason: InviteRejection };

/**
 * Whether `sessionEmail` may accept `invite` at `now`. Checks are ordered so
 * the caller can show the most specific failure: a revoked invite reports
 * "revoked" even if it also expired.
 */
export function validateInviteForAcceptance(
  invite: InviteRecord | null,
  sessionEmail: string | null | undefined,
  now: Date
): InviteValidation {
  if (!invite) return { ok: false, reason: "not_found" };
  if (invite.revokedAt) return { ok: false, reason: "revoked" };
  if (invite.acceptedAt) return { ok: false, reason: "already_accepted" };
  if (now.getTime() >= invite.expiresAt.getTime()) {
    return { ok: false, reason: "expired" };
  }
  if (!emailsMatch(invite.email, sessionEmail)) {
    return { ok: false, reason: "email_mismatch" };
  }
  return { ok: true };
}
