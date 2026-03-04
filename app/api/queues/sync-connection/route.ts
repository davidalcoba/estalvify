// Consumer: sync-connection
// Invoked by Vercel Queues (push mode) — no public URL, no auth needed.
//
// Two-phase fan-out pattern:
//
//   Phase 1 — Fan-out (accountId absent):
//     Sets the connection to SYNCING, then re-enqueues one message per
//     active account. Returns immediately — no API calls, no timeout risk.
//
//   Phase 2 — Per-account sync (accountId present):
//     Fetches balances and transactions for a single account. Each account
//     runs in its own Vercel function invocation with its own timeout budget,
//     so a connection with N accounts is never bounded by N × timeout.
//     After completing, checks whether all accounts are done and closes out
//     the connection status.

import { handleCallback, send } from "@vercel/queue";
import { prisma } from "@/lib/prisma";
import { syncAccount, toDateString } from "@/lib/banking/sync";
import { TOPICS, type SyncConnectionMessage } from "@/lib/queue";

export const POST = handleCallback<SyncConnectionMessage>(
  async (message) => {
    const { connectionId, userId, accountId, syncStartedAt, totalAccounts } = message;

    // ── Phase 1: Fan-out ──────────────────────────────────────────────────────
    if (!accountId) {
      const connection = await prisma.bankConnection.findFirst({
        where: {
          id: connectionId,
          status: { in: ["ACTIVE", "SYNCING"] },
        },
        include: { bankAccounts: { where: { isActive: true } } },
      });

      if (!connection) return; // deleted or revoked

      await prisma.bankConnection.update({
        where: { id: connectionId },
        data: { status: "SYNCING", lastSyncError: null },
      });

      const now = new Date().toISOString();

      // Enqueue one message per account — each runs in its own invocation.
      await Promise.all(
        connection.bankAccounts.map((account) =>
          send<SyncConnectionMessage>(TOPICS.syncConnection, {
            connectionId,
            userId,
            accountId: account.id,
            syncStartedAt: now,
            totalAccounts: connection.bankAccounts.length,
          })
        )
      );

      return;
    }

    // ── Phase 2: Per-account sync ─────────────────────────────────────────────
    const account = await prisma.bankAccount.findFirst({
      where: { id: accountId, isActive: true },
    });

    if (!account) return; // account deleted while message was queued

    const connection = await prisma.bankConnection.findFirst({
      where: { id: connectionId },
      select: { lastSyncAt: true },
    });

    if (!connection) return;

    const dateTo = toDateString(new Date());
    const dateFrom = connection.lastSyncAt
      ? toDateString(new Date(connection.lastSyncAt.getTime() - 24 * 60 * 60 * 1000))
      : toDateString(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000));

    let result;
    try {
      result = await syncAccount(account, userId, dateFrom, dateTo);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(`[queue/sync-connection] account ${accountId} failed:`, msg);

      const isAuthError = msg.includes("401") || msg.includes("403") || msg.includes("expired");

      await prisma.bankAccount
        .update({ where: { id: accountId }, data: { lastSyncError: msg } })
        .catch(() => {});

      if (isAuthError) {
        // Auth failure affects the whole connection — mark it as expired.
        await prisma.bankConnection
          .update({ where: { id: connectionId }, data: { status: "EXPIRED", lastSyncError: null } })
          .catch(() => {});
        return; // don't retry
      }

      throw err; // retryable — let Vercel retry the message
    }

    // ── Check whether all accounts for this connection are now done ───────────
    // An account is "done" when its lastSyncAt was set on or after syncStartedAt
    // (success) or its lastSyncError is non-null (error). The last account to
    // finish closes out the connection status.
    if (syncStartedAt && totalAccounts) {
      const startedAt = new Date(syncStartedAt);

      const doneAccounts = await prisma.bankAccount.findMany({
        where: {
          bankConnectionId: connectionId,
          isActive: true,
          OR: [
            { lastSyncAt: { gte: startedAt } },
            { lastSyncError: { not: null } },
          ],
        },
        select: { lastSyncError: true },
      });

      if (doneAccounts.length >= totalAccounts) {
        const errors = doneAccounts.flatMap((a) => (a.lastSyncError ? [a.lastSyncError] : []));
        const isRateLimited = errors.some((e) => e.includes("RATE_LIMIT:"));

        const userMessage = isRateLimited
          ? "Bank rate limit reached — sync will resume in tomorrow's daily run"
          : errors.length > 0
            ? errors.join(" | ")
            : null;

        await prisma.bankConnection
          .update({
            where: { id: connectionId },
            data: {
              status: "ACTIVE",
              lastSyncError: userMessage,
              // Only advance lastSyncAt when all accounts succeeded.
              ...(errors.length === 0 && { lastSyncAt: new Date() }),
            },
          })
          .catch(() => {});
      }
    }

    // Rate-limit errors are not retryable — acknowledge cleanly.
    if (result.errors.some((e) => e.includes("RATE_LIMIT:"))) return;

    // Other per-account errors → re-throw so Vercel retries the message.
    if (result.errors.length > 0) {
      throw new Error(`Account ${accountId} sync errors: ${result.errors.join(" | ")}`);
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
