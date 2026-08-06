// GET /api/export — GDPR data export (portability).
//
// Authenticated via the Auth.js session (the proxy also gates this path), so
// it works as a plain download link from Settings. Returns everything the
// account owns as a single JSON attachment; see lib/account/export-user.ts
// for what is included and the two deliberate omissions.

import { NextResponse } from "next/server";
import { getScope } from "@/lib/auth/scope";
import { roleAllows } from "@/lib/auth/roles";
import { buildUserExport } from "@/lib/account/export-user";

export const dynamic = "force-dynamic";

export async function GET() {
  // Owner-only: the export is the household's full financial history, not the
  // member's own data. A member-scoped profile export is a phase-2 flow.
  const scope = await getScope();
  if (!scope) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!roleAllows(scope.role, "admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const data = await buildUserExport(scope.dataUserId);
  const date = new Date().toISOString().slice(0, 10);

  return new NextResponse(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="estalvify-export-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
