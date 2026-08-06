// Contract smoke test between the MCP tool registry and the scope enforcement.
//
// This is the guard for the class of bug that has bitten repeatedly: the tool
// registry and its handler disagreeing (undeclared `offset`/`dateFrom`/
// `categoryId`, and — the reason this file exists — a scope regression where
// every read tool started returning "Insufficient scope"). It registers every
// tool through a fake server and probes each with a read-only and a write-only
// token, asserting the read/write family split. A new tool that forgets to
// declare its scope, or a change that breaks the scope plumbing, fails here.

import { describe, it, expect, vi, beforeEach } from "vitest";

// tools.ts imports the Prisma client, which constructs a Neon pool at module
// load and needs DATABASE_URL. The scope check runs before any query, so a
// stub that never actually connects is enough for this test.
vi.mock("@/lib/prisma", () => {
  const model = new Proxy(
    {},
    { get: () => vi.fn(async () => []) },
  );
  const prisma = new Proxy(
    { $transaction: vi.fn(async () => []) },
    { get: (target, prop) => (prop in target ? (target as never)[prop] : model) },
  );
  return { prisma };
});

import { registerTools } from "./tools";

// The read half of the API. Everything else must require write. Keeping this
// list explicit (rather than deriving it from the code under test) is the
// point: it's the contract, and a tool silently flipping sides trips it.
const READ_TOOLS = new Set([
  "list_transactions",
  "list_categories",
  "list_accounts",
  "get_budgets",
  "get_month_status",
  "list_recurring_series",
  "list_planned_items",
  "list_rules",
  "test_rule",
]);

type Handler = (args: unknown, extra: unknown) => Promise<unknown> | unknown;

function collectTools(): Map<string, Handler> {
  const tools = new Map<string, Handler>();
  const fakeServer = {
    registerTool: (name: string, _config: unknown, handler: Handler) => {
      tools.set(name, handler);
    },
  };
  // registerTools only uses server.registerTool.
  registerTools(fakeServer as never);
  return tools;
}

/** Invoke a tool and report whether it was denied specifically on scope. */
async function deniedOnScope(
  handler: Handler,
  scopes: string[],
): Promise<boolean> {
  const extra = { authInfo: { scopes, extra: { userId: "u1" } } };
  try {
    const result = (await handler({}, extra)) as {
      isError?: boolean;
      content?: { text?: string }[];
    };
    const text = result?.content?.map((c) => c?.text ?? "").join(" ") ?? "";
    return Boolean(result?.isError) && /Insufficient scope/.test(text);
  } catch (err) {
    return err instanceof Error && /Insufficient scope/.test(err.message);
  }
}

describe("MCP tool scope contract", () => {
  let tools: Map<string, Handler>;
  beforeEach(() => {
    tools = collectTools();
  });

  it("registers a non-trivial set of tools", () => {
    expect(tools.size).toBeGreaterThan(20);
  });

  it("every declared read tool is actually registered", () => {
    for (const name of READ_TOOLS) {
      expect(tools.has(name), `${name} must be registered`).toBe(true);
    }
  });

  it("read tools accept a read token and reject a write-only token", async () => {
    for (const name of READ_TOOLS) {
      const handler = tools.get(name)!;
      expect(
        await deniedOnScope(handler, ["read"]),
        `${name} must be allowed with the read scope`,
      ).toBe(false);
      expect(
        await deniedOnScope(handler, ["write"]),
        `${name} must be denied without the read scope`,
      ).toBe(true);
    }
  });

  it("write tools accept a write token and reject a read-only token", async () => {
    for (const [name, handler] of tools) {
      if (READ_TOOLS.has(name)) continue;
      expect(
        await deniedOnScope(handler, ["write"]),
        `${name} must be allowed with the write scope`,
      ).toBe(false);
      expect(
        await deniedOnScope(handler, ["read"]),
        `${name} must be denied without the write scope`,
      ).toBe(true);
    }
  });

  it("a legacy full-access token (unknown 'mcp' scope) reaches read tools", async () => {
    // The regression: a pre-scopes token carried scope "mcp"; scopesFromClaim
    // maps that to full access, so reads must go through.
    const { scopesFromClaim } = await import("./scopes");
    const legacy = scopesFromClaim("mcp");
    for (const name of READ_TOOLS) {
      expect(
        await deniedOnScope(tools.get(name)!, legacy),
        `${name} must be reachable by a legacy 'mcp' token`,
      ).toBe(false);
    }
  });
});
