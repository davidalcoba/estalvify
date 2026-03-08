// Daily sync cron job — enqueues a background sync for every active connection.
// Triggered by Vercel Cron at 01:00 UTC every day (configured in vercel.json).
// Protected by CRON_SECRET to prevent unauthorized calls.
//
// The actual sync logic lives in the consumer at
// /api/queues/sync-connection, which handles date ranges, retries, and
// status transitions. The cron's only job is to fan out queue messages.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { send } from "@vercel/queue";
import { TOPICS, type SyncConnectionMessage } from "@/lib/queue";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Recover connections that got stuck in SYNCING (e.g. because the Vercel
  // Queue message was lost or the consumer timed out before updating status).
  // 30 minutes is generous — normal syncs complete in seconds.
  const staleThreshold = new Date(Date.now() - 30 * 60 * 1000);
  await prisma.bankConnection.updateMany({
    where: { status: "SYNCING", updatedAt: { lt: staleThreshold } },
    data: { status: "ACTIVE" },
  });

  const activeConnections = await prisma.bankConnection.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, userId: true },
  });

  // Fan out — one message per connection, processed independently with retries.
  const results = await Promise.allSettled(
    activeConnections.map((c) =>
      send<SyncConnectionMessage>(TOPICS.syncConnection, {
        connectionId: c.id,
        userId: c.userId,
      })
    )
  );

  const queued = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;

  return NextResponse.json({
    success: true,
    connectionsQueued: queued,
    ...(failed > 0 && { failed }),
  });
}
