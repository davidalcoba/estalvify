// Guard: every MCP tool's declared inputSchema matches what its handler
// actually reads. This has drifted three times (offset, dateFrom/dateTo and
// categoryId all worked while undeclared), which forces the next MCP client to
// discover parameters by trial and error. The test parses lib/mcp/tools.ts:
// handlers destructure their args in the function signature, so the
// destructured names ARE the read surface — they must equal the schema keys.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(join(process.cwd(), "lib/mcp/tools.ts"), "utf8");

/** Substring of a balanced {...} starting at `start` (which must point at '{'). */
function balancedBraces(src: string, start: number): string {
  if (src[start] !== "{") throw new Error(`expected '{' at ${start}`);
  let depth = 0;
  let inString: string | null = null;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    const prev = src[i - 1];
    if (inString) {
      if (ch === inString && prev !== "\\") inString = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inString = ch;
      continue;
    }
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error("unbalanced braces");
}

/** Top-level property names of an object/destructuring literal source. */
function topLevelKeys(objectSrc: string): string[] {
  const inner = objectSrc.slice(1, -1);
  const keys: string[] = [];
  let depth = 0;
  let inString: string | null = null;
  let expectKey = true;
  let token = "";
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    const prev = inner[i - 1];
    if (inString) {
      if (ch === inString && prev !== "\\") inString = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inString = ch;
      continue;
    }
    if ("{[(".includes(ch)) depth++;
    else if ("}])".includes(ch)) depth--;
    else if (depth === 0) {
      if (expectKey && /[A-Za-z0-9_$]/.test(ch)) {
        token += ch;
        continue;
      }
      if (token && (ch === ":" || ch === "," || ch === "=" || ch === "?")) {
        keys.push(token);
        token = "";
        expectKey = ch === ",";
        continue;
      }
      if (ch === ",") expectKey = true;
    }
  }
  if (token) keys.push(token);
  return keys;
}

interface ToolInfo {
  name: string;
  schemaKeys: string[];
  handlerKeys: string[] | null; // null = handler takes no args (_args)
}

function parseTools(): ToolInfo[] {
  const tools: ToolInfo[] = [];
  const registration = /server\.registerTool\(\s*"([^"]+)"/g;
  const starts: { name: string; index: number }[] = [];
  for (let m = registration.exec(SOURCE); m; m = registration.exec(SOURCE)) {
    starts.push({ name: m[1], index: m.index });
  }
  for (let i = 0; i < starts.length; i++) {
    const { name, index } = starts[i];
    const end = i + 1 < starts.length ? starts[i + 1].index : SOURCE.length;
    const chunk = SOURCE.slice(index, end);

    const schemaAt = chunk.indexOf("inputSchema:");
    if (schemaAt === -1) throw new Error(`tool ${name}: no inputSchema`);
    const braceAt = chunk.indexOf("{", schemaAt);
    const schemaSrc = balancedBraces(chunk, braceAt);
    const schemaKeys = topLevelKeys(schemaSrc);

    const asyncAt = chunk.indexOf("async (", schemaAt + schemaSrc.length);
    if (asyncAt === -1) throw new Error(`tool ${name}: no handler`);
    const afterParen = chunk.slice(asyncAt + "async (".length);
    const firstMeaningful = afterParen.match(/\S/);
    let handlerKeys: string[] | null = null;
    if (firstMeaningful && firstMeaningful[0] === "{") {
      const destructureStart =
        asyncAt + "async (".length + (firstMeaningful.index ?? 0);
      handlerKeys = topLevelKeys(balancedBraces(chunk, destructureStart));
    }
    tools.push({ name, schemaKeys, handlerKeys });
  }
  return tools;
}

describe("MCP tool schemas match their handlers", () => {
  const tools = parseTools();

  it("finds a plausible number of registered tools", () => {
    expect(tools.length).toBeGreaterThanOrEqual(15);
  });

  for (const tool of tools) {
    it(`${tool.name}: handler reads exactly the declared parameters`, () => {
      if (tool.handlerKeys === null) {
        // Handler ignores args entirely (e.g. `_args`) — any declared keys
        // would be dead weight, but an empty schema is required.
        expect(tool.schemaKeys).toEqual([]);
        return;
      }
      const declared = [...tool.schemaKeys].sort();
      const read = [...tool.handlerKeys].sort();
      // Divergence in either direction is a lie in the contract: an undeclared
      // read forces clients to discover parameters by trial and error, and a
      // declared-but-ignored key promises behaviour that doesn't exist.
      expect(read).toEqual(declared);
    });
  }
});
