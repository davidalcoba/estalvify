// POST /api/banking/sync/[connectionId]
// Enqueues a background sync job for a single bank connection.
// Returns immediately — the actual sync runs in the consumer.

import { NextRequest, NextResponse } from "next/server";
import { getScope } from "@/lib/auth/scope";
import { roleAllows } from "@/lib/auth/roles";
import { prisma } from "@/lib/prisma";
import { send } from "@vercel/queue";
import { TOPICS, type SyncConnectionMessage } from "@/lib/queue";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  const scope = await getScope();
  if (!scope) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!roleAllows(scope.role, "write")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { connectionId } = await params;

  const connection = await prisma.bankConnection.findFirst({
    where: {
      id: connectionId,
      userId: scope.dataUserId,
      status: { in: ["ACTIVE", "SYNCING"] },
    },
  });

  if (!connection) {
    return NextResponse.json({ error: "Connection not found or not active" }, { status: 404 });
  }

  // Flip to SYNCING right away so the UI badge updates on the next poll.
  await prisma.bankConnection.update({
    where: { id: connectionId },
    data: { status: "SYNCING" },
  });

  try {
    const { messageId } = await send<SyncConnectionMessage>(TOPICS.syncConnection, {
      connectionId,
      userId: scope.dataUserId,
    });
    return NextResponse.json({ queued: true, messageId });
  } catch (err) {
    console.error("[sync route] Failed to enqueue sync:", err);
    // Revert so the connection isn't stuck in SYNCING.
    await prisma.bankConnection
      .update({ where: { id: connectionId }, data: { status: "ACTIVE" } })
      .catch(() => {});
    return NextResponse.json({ error: "Failed to enqueue sync job" }, { status: 500 });
  }
}
