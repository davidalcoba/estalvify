// POST /api/banking/sync/[connectionId]
// Enqueues a background sync job for a single bank connection.
// Returns immediately — the actual sync runs in the consumer.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { send } from "@vercel/queue";
import { TOPICS, type SyncConnectionMessage } from "@/lib/queue";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { connectionId } = await params;

  const connection = await prisma.bankConnection.findFirst({
    where: {
      id: connectionId,
      userId: session.user.id,
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
      userId: session.user.id,
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
