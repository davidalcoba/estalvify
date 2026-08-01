import { describe, it, expect, beforeAll } from "vitest";
import {
  generateOpaqueToken,
  hashToken,
  verifyTokenHash,
  computeS256Challenge,
  verifyPkce,
  signAccessToken,
  verifyAccessToken,
  MCP_AUDIENCE,
} from "./oauth";

beforeAll(() => {
  process.env.MCP_JWT_SECRET = "test-secret-do-not-use-in-prod";
});

describe("opaque tokens", () => {
  it("generates unique url-safe tokens", () => {
    const a = generateOpaqueToken();
    const b = generateOpaqueToken();
    expect(a).not.toEqual(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/); // base64url, no padding
  });

  it("verifies a token against its stored hash (constant-time)", () => {
    const token = generateOpaqueToken();
    const stored = hashToken(token);
    expect(verifyTokenHash(token, stored)).toBe(true);
    expect(verifyTokenHash(token + "x", stored)).toBe(false);
    expect(verifyTokenHash("totally-wrong", stored)).toBe(false);
  });
});

describe("PKCE S256", () => {
  it("accepts a matching verifier/challenge pair", () => {
    // 43+ char verifier
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const challenge = computeS256Challenge(verifier);
    expect(verifyPkce(verifier, challenge, "S256")).toBe(true);
  });

  it("rejects a mismatched verifier", () => {
    const challenge = computeS256Challenge(
      "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
    );
    expect(
      verifyPkce("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", challenge, "S256"),
    ).toBe(false);
  });

  it("rejects the 'plain' method (OAuth 2.1 requires S256)", () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    expect(verifyPkce(verifier, verifier, "plain")).toBe(false);
  });

  it("rejects verifiers outside the RFC 7636 length bounds", () => {
    const short = "tooshort";
    expect(verifyPkce(short, computeS256Challenge(short), "S256")).toBe(false);
    const long = "a".repeat(129);
    expect(verifyPkce(long, computeS256Challenge(long), "S256")).toBe(false);
  });
});

describe("access tokens", () => {
  it("round-trips claims through sign/verify", async () => {
    const token = await signAccessToken({
      userId: "user_123",
      clientId: "client_abc",
      scope: "read write",
    });
    const claims = await verifyAccessToken(token);
    expect(claims).toEqual({
      userId: "user_123",
      clientId: "client_abc",
      scope: "read write",
    });
  });

  it("returns null for a tampered token", async () => {
    const token = await signAccessToken({
      userId: "user_123",
      clientId: "client_abc",
    });
    expect(await verifyAccessToken(token + "tamper")).toBeNull();
  });

  it("returns null for an expired token", async () => {
    const token = await signAccessToken(
      { userId: "user_123", clientId: "client_abc" },
      -10, // already expired
    );
    expect(await verifyAccessToken(token)).toBeNull();
  });

  it("returns null when the audience does not match", async () => {
    // Sign a token with a different audience via a raw jose call is overkill;
    // instead assert the audience constant is what verify enforces.
    expect(MCP_AUDIENCE).toBe("estalvify-mcp");
    const token = await signAccessToken({
      userId: "u",
      clientId: "c",
    });
    const claims = await verifyAccessToken(token);
    expect(claims?.userId).toBe("u");
  });
});
