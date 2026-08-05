import { describe, it, expect } from "vitest";
import { isSignupAllowed } from "./signup-policy";

describe("isSignupAllowed", () => {
  it("defaults closed when unset or empty", () => {
    expect(isSignupAllowed(undefined)).toBe(false);
    expect(isSignupAllowed(null)).toBe(false);
    expect(isSignupAllowed("")).toBe(false);
    expect(isSignupAllowed("   ")).toBe(false);
  });

  it("opens only on explicit truthy values", () => {
    expect(isSignupAllowed("true")).toBe(true);
    expect(isSignupAllowed("TRUE")).toBe(true);
    expect(isSignupAllowed(" 1 ")).toBe(true);
    expect(isSignupAllowed("yes")).toBe(true);
    expect(isSignupAllowed("on")).toBe(true);
  });

  it("treats anything unrecognized as closed — a typo must not open signup", () => {
    expect(isSignupAllowed("false")).toBe(false);
    expect(isSignupAllowed("0")).toBe(false);
    expect(isSignupAllowed("enabled")).toBe(false);
    expect(isSignupAllowed("truee")).toBe(false);
  });
});
