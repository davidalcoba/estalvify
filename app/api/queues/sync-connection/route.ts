// Consumer: sync-connection
// Invoked by Vercel Queues (push mode) — no public URL, no auth needed.
// Fetches transactions and balances for a single bank connection.

import { handleCallback } from "@vercel/queue";
import { prisma } from "@/lib/prisma";
import { syncConnection, toDateString } from "@/lib/banking/sync";
import type { SyncConnectionMessage } from "@/lib/queue";

export const POST = handleCallback<SyncConnectionMessage>(
  async (message) => {
    const { connectionId } = message;

    const connection = await prisma.bankConnection.findFirst({
      where: {
        id: connectionId,
        status: { in: ["ACTIVE", "SYNCING"] },
      },
      include: { bankAccounts: { where: { isActive: true } } },
    });

    if (!connection) {
      // Connection was deleted or revoked — nothing to do, acknowledge cleanly.
      return;
    }

    await prisma.bankConnection.update({
      where: { id: connectionId },
      data: { status: "SYNCING" },
    });

    // Determine date range. For the first sync (no lastSyncAt) fetch 90 days
    // of history so the user sees meaningful data right away. Subsequent syncs
    // use a 1-day overlap on lastSyncAt to catch any late-settling transactions.
    const dateTo = toDateString(new Date());
    const dateFrom = connection.lastSyncAt
      ? toDateString(new Date(connection.lastSyncAt.getTime() - 24 * 60 * 60 * 1000))
      : toDateString(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000));

    try {
      await syncConnection(connection, dateFrom, dateTo);

      await prisma.bankConnection.update({
        where: { id: connectionId },
        data: { status: "ACTIVE" },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(`[queue/sync-connection] ${connectionId} failed:`, msg);

      const isAuthError = msg.includes("401") || msg.includes("403") || msg.includes("expired");

      await prisma.bankConnection
        .update({
          where: { id: connectionId },
          data: { status: isAuthError ? "EXPIRED" : "ACTIVE" },
        })
        .catch(() => {});

      // Re-throw so Vercel retries the message (unless it's an auth error
      // — retrying won't help, so we swallow it and acknowledge cleanly).
      if (!isAuthError) throw err;
    }
  },
  {
    retry: (_error, metadata) => {
      // Exponential backoff capped at 5 min; give up after 5 attempts.
      if (metadata.deliveryCount >= 5) return { acknowledge: true };
      const delay = Math.min(300, 2 ** metadata.deliveryCount * 10);
      return { afterSeconds: delay };
    },
  }
);
