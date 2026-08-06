import { describe, it, expect } from "vitest";
import {
  normalizeRequestedScope,
  scopesFromClaim,
  scopesForRole,
  hasScope,
  FULL_SCOPE,
} from "./scopes";

describe("scopesForRole", () => {
  it("caps a VIEWER at read, whatever was granted", () => {
    expect(scopesForRole(["read", "write"], "VIEWER")).toEqual(["read"]);
    expect(scopesForRole(["write"], "VIEWER")).toEqual(["read"]);
    // Never empty: [] would round-trip through scopesFromClaim as FULL access.
    expect(scopesForRole([], "VIEWER")).toEqual(["read"]);
  });

  it("leaves EDITOR and OWNER grants untouched", () => {
    expect(scopesForRole(["read", "write"], "EDITOR")).toEqual(["read", "write"]);
    expect(scopesForRole(["read"], "OWNER")).toEqual(["read"]);
  });
});

describe("normalizeRequestedScope", () => {
  it("grants full access when the client requests nothing", () => {
    expect(normalizeRequestedScope(undefined)).toBe(FULL_SCOPE);
    expect(normalizeRequestedScope("")).toBe(FULL_SCOPE);
    expect(normalizeRequestedScope("   ")).toBe(FULL_SCOPE);
  });

  it("narrows to known scopes and keeps canonical order", () => {
    expect(normalizeRequestedScope("write read")).toBe("read write");
    expect(normalizeRequestedScope("read")).toBe("read");
    expect(normalizeRequestedScope("read read")).toBe("read");
  });

  it("falls back to full access when nothing requested is known", () => {
    // A client asking for scopes we don't model (e.g. "claudeai") must not end
    // up with a token that can do nothing.
    expect(normalizeRequestedScope("claudeai offline_access")).toBe(FULL_SCOPE);
  });

  it("drops unknown scopes while keeping known ones", () => {
    expect(normalizeRequestedScope("read claudeai")).toBe("read");
  });
});

describe("scopesFromClaim", () => {
  it("treats a missing claim as full access (legacy tokens)", () => {
    expect(scopesFromClaim(undefined)).toEqual(["read", "write"]);
    expect(scopesFromClaim("")).toEqual(["read", "write"]);
  });

  it("honors a claim that names known scopes", () => {
    expect(scopesFromClaim("read")).toEqual(["read"]);
    expect(scopesFromClaim("write read")).toEqual(["read", "write"]);
  });

  it("treats an unknown-only claim as full access (legacy 'mcp' value)", () => {
    // A refresh token minted before scopes existed carried the client's raw
    // requested scope (e.g. "mcp"); rotation keeps it. It must not lock reads.
    expect(scopesFromClaim("mcp")).toEqual(["read", "write"]);
    expect(scopesFromClaim("claudeai offline_access")).toEqual(["read", "write"]);
  });

  it("drops unknown scopes when a known one is present", () => {
    expect(scopesFromClaim("read mcp")).toEqual(["read"]);
  });
});

describe("hasScope", () => {
  it("authorizes only what was granted", () => {
    expect(hasScope(["read"], "read")).toBe(true);
    expect(hasScope(["read"], "write")).toBe(false);
    expect(hasScope(["read", "write"], "write")).toBe(true);
  });
});
