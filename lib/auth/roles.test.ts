import { describe, expect, it } from "vitest";
import { roleAllows, type ScopeLevel } from "./roles";
import type { HouseholdRole } from "@/app/generated/prisma";

// The role→level matrix from PLAN_MULTIUSER.md §5, spelled out case by case.
// This table is the source of truth for what each role may do.
const MATRIX: Array<[HouseholdRole, ScopeLevel, boolean]> = [
  // VIEWER: read-only, everywhere.
  ["VIEWER", "read", true],
  ["VIEWER", "write", false],
  ["VIEWER", "admin", false],
  // EDITOR: domain writes (categorize, rules, plan, recurring, connections,
  // household settings), but no members/invites and no Privacy & data.
  ["EDITOR", "read", true],
  ["EDITOR", "write", true],
  ["EDITOR", "admin", false],
  // OWNER: everything.
  ["OWNER", "read", true],
  ["OWNER", "write", true],
  ["OWNER", "admin", true],
];

describe("roleAllows", () => {
  it.each(MATRIX)("%s → %s = %s", (role, level, expected) => {
    expect(roleAllows(role, level)).toBe(expected);
  });
});
