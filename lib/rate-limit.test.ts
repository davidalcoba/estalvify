import { describe, it, expect } from "vitest";
import {
  RATE_LIMITS,
  rateLimitKey,
  windowExpiryThreshold,
  isWithinLimit,
  clientIp,
} from "./rate-limit";

describe("rate-limit pure helpers", () => {
  it("builds keys that cannot collide across limiters", () => {
    expect(rateLimitKey("oauth-token", "1.2.3.4")).toBe("oauth-token:1.2.3.4");
    expect(rateLimitKey("oauth-token", "x")).not.toBe(
      rateLimitKey("oauth-register", "x"),
    );
  });

  it("computes the window expiry threshold", () => {
    const now = new Date("2026-08-05T12:00:00Z");
    expect(windowExpiryThreshold(now, 60).toISOString()).toBe(
      "2026-08-05T11:59:00.000Z",
    );
  });

  it("allows exactly `limit` requests per window", () => {
    expect(isWithinLimit(1, 5)).toBe(true);
    expect(isWithinLimit(5, 5)).toBe(true);
    expect(isWithinLimit(6, 5)).toBe(false);
  });

  it("every configured limiter has a positive limit and window", () => {
    for (const rule of Object.values(RATE_LIMITS)) {
      expect(rule.limit).toBeGreaterThan(0);
      expect(rule.windowSeconds).toBeGreaterThan(0);
    }
  });
});

describe("clientIp", () => {
  const req = (headers: Record<string, string>) =>
    new Request("https://example.com", { headers });

  it("takes the first x-forwarded-for entry", () => {
    expect(clientIp(req({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe(
      "203.0.113.7",
    );
  });

  it("falls back to x-real-ip, then to a stable sentinel", () => {
    expect(clientIp(req({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientIp(req({}))).toBe("unknown");
  });

  it("ignores an empty forwarded header", () => {
    expect(clientIp(req({ "x-forwarded-for": " ", "x-real-ip": "1.1.1.1" }))).toBe(
      "1.1.1.1",
    );
  });
});
