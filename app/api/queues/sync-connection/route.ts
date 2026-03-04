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

    // ── Run sync ─────────────────────────────────────────────────────────────
    let result;
    try {
      result = await syncConnection(connection, dateFrom, dateTo);
    } catch (err) {
      // Unexpected exception thrown by syncConnection (e.g. DB error, network).
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(`[queue/sync-connection] ${connectionId} failed:`, msg);

      const isAuthError = msg.includes("401") || msg.includes("403") || msg.includes("expired");
      const isRateLimit = msg.includes("429") || msg.includes("ASPSP_RATE_LIMIT") || msg.includes("HUB046");

      await prisma.bankConnection
        .update({
          where: { id: connectionId },
          data: {
            status: isAuthError ? "EXPIRED" : "ACTIVE",
            lastSyncError: isAuthError
              ? null
              : isRateLimit
                ? "Bank rate limit reached — sync will resume in tomorrow's daily run"
                : msg,
          },
        })
        .catch(() => {});

      // Auth errors and rate limits are not retryable — acknowledge cleanly.
      // Retrying a 429 would burn more PSD2 quota with no benefit.
      if (!isAuthError && !isRateLimit) throw err;
      return;
    }

    // ── Evaluate result ───────────────────────────────────────────────────────
    if (result.errors.length > 0) {
      // syncConnection() tags rate-limit errors with a "RATE_LIMIT:" prefix
      // so we can distinguish them from transient failures.
      // NOTE: errors are formatted as "Account {uid} RATE_LIMIT:..." so we
      // need includes() not startsWith().
      const isRateLimited = result.errors.some((e) => e.includes("RATE_LIMIT:"));

      const userMessage = isRateLimited
        ? "Bank rate limit reached — sync will resume in tomorrow's daily run"
        : result.errors.join(" | ");

      // Preserve lastSyncAt so the next sync re-fetches from the correct
      // start date and doesn't skip the window where data is missing.
      await prisma.bankConnection.update({
        where: { id: connectionId },
        data: { status: "ACTIVE", lastSyncError: userMessage },
      });

      if (isRateLimited) {
        // Retrying a rate-limited sync wastes quota — acknowledge and let
        // tomorrow's cron pick it up from the preserved lastSyncAt.
        return;
      }

      // Other errors are retryable — re-throw so Vercel retries the message.
      throw new Error(`Sync completed with errors: ${result.errors.join(" | ")}`);
    }

    // Clean success: advance lastSyncAt and clear any previous error.
    await prisma.bankConnection.update({
      where: { id: connectionId },
      data: {
        status: "ACTIVE",
        lastSyncAt: new Date(),
        lastSyncError: null,
      },
    });
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
