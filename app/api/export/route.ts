// GET /api/export — GDPR data export (portability).
//
// Authenticated via the Auth.js session (the proxy also gates this path), so
// it works as a plain download link from Settings. Returns everything the
// account owns as a single JSON attachment; see lib/account/export-user.ts
// for what is included and the two deliberate omissions.

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { buildUserExport } from "@/lib/account/export-user";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const data = await buildUserExport(session.user.id);
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
