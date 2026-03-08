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

    const connectionExists = await prisma.bankConnection.findFirst({
      where: { id: connectionId },
      select: { id: true },
    });

    if (!connectionExists) return;

    const dateTo = toDateString(new Date());
    // Use per-account lastSyncAt so each account tracks its own sync window
    // independently. This prevents a rate-limited account from forcing all
    // accounts to re-fetch the full 90-day window on every subsequent sync.
    const dateFrom = account.lastSyncAt
      ? toDateString(new Date(account.lastSyncAt.getTime() - 24 * 60 * 60 * 1000))
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
    // Three independent signals that an account has been processed:
    //   1. lastSyncAt >= syncStartedAt  — success path
    //   2. lastSyncError IS NOT NULL    — error path
    //   3. has a balance from today     — fallback (reliable even if lastSyncAt
    //                                     write was swallowed by .catch)
    // The last account to finish closes out the connection status.
    if (syncStartedAt && totalAccounts) {
      const startedAt = new Date(syncStartedAt);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const doneAccounts = await prisma.bankAccount.findMany({
        where: {
          bankConnectionId: connectionId,
          isActive: true,
          OR: [
            { lastSyncAt: { gte: startedAt } },
            { lastSyncError: { not: null } },
            { balances: { some: { date: { gte: today } } } },
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
              // Advance lastSyncAt on full success or when only rate-limit errors
              // occurred — partial data is still data, and advancing ensures
              // tomorrow's cron starts an incremental sync instead of 90 days again.
              ...((errors.length === 0 || isRateLimited) && { lastSyncAt: new Date() }),
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
