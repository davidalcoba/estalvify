import { describe, expect, it } from "vitest";
import {
  emailsMatch,
  inviteExpiryFrom,
  INVITE_TTL_DAYS,
  isInvitableRole,
  validateInviteForAcceptance,
  type InviteRecord,
} from "./invite";

const NOW = new Date("2026-08-06T12:00:00Z");

function invite(overrides: Partial<InviteRecord> = {}): InviteRecord {
  return {
    email: "partner@example.com",
    expiresAt: new Date("2026-08-13T12:00:00Z"),
    acceptedAt: null,
    revokedAt: null,
    ...overrides,
  };
}

describe("validateInviteForAcceptance", () => {
  it("accepts a live invite whose email matches the session", () => {
    expect(
      validateInviteForAcceptance(invite(), "partner@example.com", NOW)
    ).toEqual({ ok: true });
  });

  it("matches emails case-insensitively and ignoring whitespace", () => {
    expect(
      validateInviteForAcceptance(invite(), "  Partner@Example.COM ", NOW)
    ).toEqual({ ok: true });
  });

  it("rejects a missing invite", () => {
    expect(
      validateInviteForAcceptance(null, "partner@example.com", NOW)
    ).toEqual({ ok: false, reason: "not_found" });
  });

  it("rejects a revoked invite, even when it is also expired", () => {
    const revoked = invite({
      revokedAt: new Date("2026-08-01T00:00:00Z"),
      expiresAt: new Date("2026-08-02T00:00:00Z"),
    });
    expect(
      validateInviteForAcceptance(revoked, "partner@example.com", NOW)
    ).toEqual({ ok: false, reason: "revoked" });
  });

  it("rejects an already-accepted invite (single use)", () => {
    const used = invite({ acceptedAt: new Date("2026-08-05T00:00:00Z") });
    expect(
      validateInviteForAcceptance(used, "partner@example.com", NOW)
    ).toEqual({ ok: false, reason: "already_accepted" });
  });

  it("rejects at the exact expiry instant (expiry is exclusive)", () => {
    const expiring = invite({ expiresAt: NOW });
    expect(
      validateInviteForAcceptance(expiring, "partner@example.com", NOW)
    ).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects a session email that does not match — the token alone is not enough", () => {
    expect(
      validateInviteForAcceptance(invite(), "intruder@example.com", NOW)
    ).toEqual({ ok: false, reason: "email_mismatch" });
  });

  it("rejects a session without an email", () => {
    expect(validateInviteForAcceptance(invite(), null, NOW)).toEqual({
      ok: false,
      reason: "email_mismatch",
    });
  });
});

describe("emailsMatch", () => {
  it("never matches on empty values (no accidental catch-all)", () => {
    expect(emailsMatch("", "")).toBe(false);
    expect(emailsMatch("a@b.c", null)).toBe(false);
    expect(emailsMatch(undefined, "a@b.c")).toBe(false);
  });
});

describe("isInvitableRole", () => {
  it("allows EDITOR and VIEWER, never OWNER or garbage", () => {
    expect(isInvitableRole("EDITOR")).toBe(true);
    expect(isInvitableRole("VIEWER")).toBe(true);
    expect(isInvitableRole("OWNER")).toBe(false);
    expect(isInvitableRole("admin")).toBe(false);
  });
});

describe("inviteExpiryFrom", () => {
  it("adds the TTL to now", () => {
    expect(inviteExpiryFrom(NOW).getTime() - NOW.getTime()).toBe(
      INVITE_TTL_DAYS * 24 * 60 * 60 * 1000
    );
  });
});
