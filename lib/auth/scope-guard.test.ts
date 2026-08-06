import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Guard from PLAN_MULTIUSER.md §10: after phase 1, NO page/action/route under
// app/(app) may read `session.user.id` for domain data — the data scope comes
// from requireScope/getScope (lib/auth/scope.ts), which resolves the household
// owner's userId. A direct session read reintroduces per-member data silos the
// moment a second member exists. app/(auth) (login, OAuth consent) and the MCP
// / cron / queue routes are actor-identity surfaces and stay session/token
// based until their own phases.

const ROOT = join(__dirname, "..", "..");

const GUARDED_DIRS = ["app/(app)", "app/api/banking", "app/api/export"];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /\.(ts|tsx)$/.test(e.name))
    .map((e) => join(e.parentPath, e.name));
}

describe("household scope guard", () => {
  it("no guarded file reads session.user.id (use requireScope instead)", () => {
    const offenders: string[] = [];
    for (const dir of GUARDED_DIRS) {
      for (const file of sourceFiles(join(ROOT, dir))) {
        const src = readFileSync(file, "utf8");
        if (src.includes("session.user.id") || src.includes("session!.user.id")) {
          offenders.push(file.slice(ROOT.length + 1));
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
