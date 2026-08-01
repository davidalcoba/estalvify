import { describe, it, expect } from "vitest";
import { isAuthError, isRateLimitError } from "./sync-errors";

// Real-world message shape from enable-banking.ts request():
//   `Enable Banking API error <status>: <body>`

describe("isRateLimitError", () => {
  it("matches HTTP 429", () => {
    expect(isRateLimitError("Enable Banking API error 429: too many requests")).toBe(true);
  });

  it("matches the ASPSP rate-limit codes", () => {
    expect(isRateLimitError("... ASPSP_RATE_LIMIT ...")).toBe(true);
    expect(isRateLimitError("... HUB046 ...")).toBe(true);
  });

  it("does not match auth or generic errors", () => {
    expect(isRateLimitError("Enable Banking API error 401: unauthorized")).toBe(false);
    expect(isRateLimitError("Enable Banking API error 500: server error")).toBe(false);
  });
});

describe("isAuthError", () => {
  it("matches HTTP 401 and 403", () => {
    expect(isAuthError("Enable Banking API error 401: session expired")).toBe(true);
    expect(isAuthError("Enable Banking API error 403: forbidden")).toBe(true);
  });

  it("matches an explicit 'expired' message", () => {
    expect(isAuthError("consent has expired")).toBe(true);
  });

  it("does not match rate-limit or generic errors", () => {
    expect(isAuthError("Enable Banking API error 429: too many requests")).toBe(false);
    expect(isAuthError("Enable Banking API error 404: not found")).toBe(false);
    expect(isAuthError("Enable Banking API error 500: server error")).toBe(false);
  });
});
