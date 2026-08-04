// Daily sync cron job — enqueues a background sync for every active connection.
// Triggered by Vercel Cron at 01:00 UTC every day (configured in vercel.json).
// Protected by CRON_SECRET to prevent unauthorized calls.
//
// The actual sync logic lives in the consumer at
// /api/queues/sync-connection, which handles date ranges, retries, and
// status transitions. The cron's only job is to fan out queue messages.

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { send } from "@vercel/queue";
import { expireStaleConsents } from "@/lib/banking/connection-status";
import { TOPICS, type SyncConnectionMessage } from "@/lib/queue";
import { generateNotificationsForUser } from "@/lib/notifications/generate";

/** Constant-time bearer check that fails closed when the secret is unset. An
 * absent CRON_SECRET must never authenticate — otherwise the header
 * `Bearer undefined` would open the endpoint to anyone. */
function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
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

  // Drop connections with an expired PSD2 consent out of the sync rotation —
  // they would only 401. They resurface once the user reconnects.
  await expireStaleConsents();

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

  // Refresh in-app notifications. Idempotent and best-effort — failures must not
  // break the sync run.
  //
  // Deliberately NOT derived from activeConnections. A user whose only connection
  // has an expired consent has no active connection, so deriving the list from
  // the sync fan-out silenced notifications for exactly the user in trouble —
  // including the alert that would have told them the sync had stopped. Anyone
  // who has ever connected a bank gets their notifications regenerated.
  const notifiableUsers = await prisma.user.findMany({
    where: { bankConnections: { some: {} } },
    select: { id: true },
  });
  await Promise.allSettled(
    notifiableUsers.map((u) => generateNotificationsForUser(u.id))
  );

  return NextResponse.json({
    success: true,
    connectionsQueued: queued,
    ...(failed > 0 && { failed }),
  });
}
