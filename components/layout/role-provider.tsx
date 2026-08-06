"use client";

// Household role context (PLAN_MULTIUSER.md phase 3). Mounted once in the
// app/(app) layout with the role resolved server-side; client components
// consult it to HIDE mutation affordances a VIEWER can't use. This is
// presentation only — the security is the server (`requireScope` per
// action/route, since phase 1). Never gate anything here that isn't also
// gated there.

import { createContext, useContext } from "react";
import type { HouseholdRole } from "@/app/generated/prisma";

const RoleContext = createContext<HouseholdRole>("OWNER");

export function RoleProvider({
  role,
  children,
}: {
  role: HouseholdRole;
  children: React.ReactNode;
}) {
  return <RoleContext.Provider value={role}>{children}</RoleContext.Provider>;
}

export function useHouseholdRole(): HouseholdRole {
  return useContext(RoleContext);
}

/** Mirror of the pure matrix's write level: EDITOR and OWNER mutate. */
export function useCanWrite(): boolean {
  return useHouseholdRole() !== "VIEWER";
}
