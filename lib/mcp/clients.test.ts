import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getStaticClient,
  isDcrDisabled,
  isAllowedRedirectUri,
  extractClientAuth,
  clientSecretMatches,
  type ResolvedClient,
} from "./clients";

const ENV_KEYS = [
  "MCP_OAUTH_CLIENT_ID",
  "MCP_OAUTH_CLIENT_SECRET",
  "MCP_OAUTH_REDIRECT_URIS",
];

beforeEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});

describe("static client config", () => {
  it("is null (DCR enabled) when no client id configured", () => {
    expect(getStaticClient()).toBeNull();
    expect(isDcrDisabled()).toBe(false);
  });

  it("parses a confidential client and disables DCR", () => {
    process.env.MCP_OAUTH_CLIENT_ID = "mcp_fixed";
    process.env.MCP_OAUTH_CLIENT_SECRET = "s3cret";
    process.env.MCP_OAUTH_REDIRECT_URIS =
      "https://claude.ai/api/mcp/auth_callback, https://claude.com/cb";
    const c = getStaticClient()!;
    expect(c.clientId).toBe("mcp_fixed");
    expect(c.clientSecret).toBe("s3cret");
    expect(c.redirectUris).toEqual([
      "https://claude.ai/api/mcp/auth_callback",
      "https://claude.com/cb",
    ]);
    expect(isDcrDisabled()).toBe(true);
  });

  it("treats a client with no secret as a public fixed client", () => {
    process.env.MCP_OAUTH_CLIENT_ID = "mcp_fixed";
    expect(getStaticClient()!.clientSecret).toBeUndefined();
  });
});

describe("redirect_uri validation", () => {
  const staticClient: ResolvedClient = {
    clientId: "mcp_fixed",
    redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
    isStatic: true,
  };

  it("accepts an exact match", () => {
    expect(
      isAllowedRedirectUri("https://claude.ai/api/mcp/auth_callback", staticClient),
    ).toBe(true);
  });

  it("accepts any Anthropic-hosted callback for the static client", () => {
    expect(isAllowedRedirectUri("https://claude.ai/whatever", staticClient)).toBe(true);
    expect(isAllowedRedirectUri("https://claude.com/x/y", staticClient)).toBe(true);
  });

  it("rejects non-Anthropic hosts", () => {
    expect(isAllowedRedirectUri("https://evil.example/cb", staticClient)).toBe(false);
  });

  it("for dynamic clients requires an exact match (no host rule)", () => {
    const dyn: ResolvedClient = {
      clientId: "mcp_dyn",
      redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
      isStatic: false,
    };
    expect(isAllowedRedirectUri("https://claude.ai/other", dyn)).toBe(false);
    expect(
      isAllowedRedirectUri("https://claude.ai/api/mcp/auth_callback", dyn),
    ).toBe(true);
  });
});

describe("client authentication extraction", () => {
  it("reads client_secret_basic (Authorization: Basic)", () => {
    const basic = "Basic " + Buffer.from("mcp_fixed:s3cret").toString("base64");
    expect(extractClientAuth(basic, {})).toEqual({
      clientId: "mcp_fixed",
      clientSecret: "s3cret",
    });
  });

  it("reads client_secret_post (body params)", () => {
    expect(
      extractClientAuth(null, { client_id: "mcp_fixed", client_secret: "s3cret" }),
    ).toEqual({ clientId: "mcp_fixed", clientSecret: "s3cret" });
  });
});

describe("clientSecretMatches", () => {
  it("matches equal secrets and rejects others", () => {
    expect(clientSecretMatches("abc", "abc")).toBe(true);
    expect(clientSecretMatches("abc", "abd")).toBe(false);
    expect(clientSecretMatches("abc", "abcd")).toBe(false);
  });
});
