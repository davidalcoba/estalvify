// Pure half of the household access model (PLAN_MULTIUSER.md §5): the
// role→level matrix. The IO half (session → membership → scope) lives in
// lib/auth/scope.ts. This file is the source of truth for what each role may
// do — keep the table in the plan doc in sync with the tests here.

import type { HouseholdRole } from "@/app/generated/prisma";

/**
 * What a server action / page / route requires:
 * - "read":  view household data (dashboard, reports, transactions, plan…)
 * - "write": mutate household data (categorize, rules, plan, recurring,
 *            bank connections, household settings)
 * - "admin": owner-only surface (members & invites, Privacy & data —
 *            export and household deletion)
 */
export type ScopeLevel = "read" | "write" | "admin";

const LEVEL_RANK: Record<ScopeLevel, number> = {
  read: 0,
  write: 1,
  admin: 2,
};

const ROLE_RANK: Record<HouseholdRole, number> = {
  VIEWER: 0,
  EDITOR: 1,
  OWNER: 2,
};

/** Whether `role` satisfies the required `level`. */
export function roleAllows(role: HouseholdRole, level: ScopeLevel): boolean {
  return ROLE_RANK[role] >= LEVEL_RANK[level];
}
