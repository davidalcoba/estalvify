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

import { z } from "zod";
import { handleCallback, send } from "@vercel/queue";
import { prisma } from "@/lib/prisma";
import { syncAccount, toDateString } from "@/lib/banking/sync";
import { AUTH_ERROR_PREFIX } from "@/lib/banking/sync-errors";
import { runRules } from "@/lib/rules/apply";
import { TOPICS, type SyncConnectionMessage } from "@/lib/queue";
import { generateNotificationsForUser } from "@/lib/notifications/generate";

// Validate the message shape. The payload is our own, but a consumer endpoint
// must never trust its body blindly: every lookup below is additionally scoped
// so the message's `userId` only ever reaches rows that actually belong to it.
const messageSchema = z.object({
  connectionId: z.string().min(1),
  userId: z.string().min(1),
  accountId: z.string().min(1).optional(),
  syncStartedAt: z.string().optional(),
  totalAccounts: z.number().int().positive().optional(),
});

export const POST = handleCallback<SyncConnectionMessage>(
  async (rawMessage) => {
    const parsed = messageSchema.safeParse(rawMessage);
    if (!parsed.success) {
      console.warn("[queue/sync-connection] Rejected malformed message");
      return; // ack — retrying a malformed message is pointless
    }
    const { connectionId, userId, accountId, syncStartedAt, totalAccounts } = parsed.data;

    // ── Phase 1: Fan-out ──────────────────────────────────────────────────────
    if (!accountId) {
      // Scope by userId: a forged connectionId for another user resolves to null
      // and the fan-out simply does nothing.
      const connection = await prisma.bankConnection.findFirst({
        where: {
          id: connectionId,
          userId,
          status: { in: ["ACTIVE", "SYNCING"] },
        },
        include: { bankAccounts: { where: { isActive: true } } },
      });

      if (!connection) return; // deleted, revoked, or not this user's

      await prisma.bankConnection.update({
        where: { id: connectionId },
        data: { status: "SYNCING" },
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
    // Scope the account to the message's userId AND connection. This is the
    // ownership check: a forged message can only ever touch rows that genuinely
    // belong to (userId, connectionId), so it cannot write into another user's
    // account or run another user's rules.
    const account = await prisma.bankAccount.findFirst({
      where: { id: accountId, userId, bankConnectionId: connectionId, isActive: true },
    });

    if (!account) {
      console.warn(`[queue/sync-connection] Phase 2 skipped: account ${accountId} not found for this user/connection (connectionId=${connectionId})`);
      return;
    }

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
          .update({ where: { id: connectionId }, data: { status: "EXPIRED" } })
          .catch(() => {});
        return; // don't retry
      }

      throw err; // retryable — let Vercel retry the message
    }

    // ── Auth/consent expiry ───────────────────────────────────────────────────
    // A 401/403 from the bank means the PSD2 consent expired. syncAccount
    // accumulates these as AUTH_ERROR:-tagged errors instead of throwing, so the
    // outer catch above never sees them. Handle them here: mark the whole
    // connection EXPIRED (which surfaces the Reconnect button in the UI) and
    // acknowledge — retrying a 401 is pointless. Must run BEFORE the done-count
    // block below, which would otherwise flip the connection back to ACTIVE.
    if (result.errors.some((e) => e.includes(AUTH_ERROR_PREFIX))) {
      await prisma.bankConnection
        .update({ where: { id: connectionId }, data: { status: "EXPIRED" } })
        .catch(() => {});
      return;
    }

    // ── Auto-categorize what just arrived ─────────────────────────────────────
    // Rules used to run only on demand, so every sync reopened the backlog.
    // Restricted to uncategorized rows, which is what makes this safe here:
    // accounts finish in parallel and the queue retries messages, so several
    // overlapping runs are expected — they converge on the same result and
    // never touch a row that already has a category.
    //
    // Deliberately swallowed: a rule failure must not fail a sync that already
    // stored its transactions, or the retry would re-run the whole fetch.
    if (result.errors.length === 0 && result.transactionsFetched > 0) {
      try {
        const report = await runRules(userId, { onlyUncategorized: true });
        console.log(
          `[queue/sync-connection] account ${accountId}: auto-categorized ` +
            `${report.totalMatched}/${result.transactionsFetched} new transactions`
        );
      } catch (err) {
        console.error(
          `[queue/sync-connection] account ${accountId} auto-categorize failed:`,
          err instanceof Error ? err.message : "Unknown error"
        );
      }
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

      const doneCount = await prisma.bankAccount.count({
        where: {
          bankConnectionId: connectionId,
          isActive: true,
          OR: [
            { lastSyncAt: { gte: startedAt } },
            { lastSyncError: { not: null } },
            { balances: { some: { date: { gte: today } } } },
          ],
        },
      });

      if (doneCount >= totalAccounts) {
        await prisma.bankConnection
          .update({ where: { id: connectionId }, data: { status: "ACTIVE" } })
          .catch(() => {});

        // Regenerate the alerts now that this connection's fresh transactions
        // and balances have landed. The cron also calls this, but it does so
        // right after *enqueuing* the syncs — so it always evaluated
        // yesterday's data, and any push went out for an event that had
        // already passed. Here it runs on what just arrived.
        //
        // Best-effort and idempotent: generation upserts by (userId,
        // dedupeKey) and only pushes specs that did not already exist, so
        // several connections finishing cannot double-notify.
        await generateNotificationsForUser(userId).catch((err) =>
          console.warn("[queue/sync] notification refresh failed:", err),
        );
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
