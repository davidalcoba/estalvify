import { describe, it, expect } from "vitest";
import {
  normalizeRequestedScope,
  scopesFromClaim,
  hasScope,
  FULL_SCOPE,
} from "./scopes";

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

  it("parses a present claim literally", () => {
    expect(scopesFromClaim("read")).toEqual(["read"]);
  });
});

describe("hasScope", () => {
  it("authorizes only what was granted", () => {
    expect(hasScope(["read"], "read")).toBe(true);
    expect(hasScope(["read"], "write")).toBe(false);
    expect(hasScope(["read", "write"], "write")).toBe(true);
  });
});
