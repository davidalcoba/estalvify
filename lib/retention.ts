// Data retention (GDPR storage limitation, art. 5.1.e).
//
// Nothing in this schema expired on its own: sessions, auth codes, refresh
// tokens, notifications and rate-limit rows all accumulated forever. This
// module is the single place that says how long each short-lived record class
// lives, builds the corresponding Prisma filters (pure — unit-tested), and
// purges them. The daily cron calls `purgeExpiredRecords`; the run is
// idempotent and best-effort.
//
// Deliberately NOT covered: the user's financial data (transactions,
// balances, categories, plan). That is kept for as long as the account exists
// and leaves via account deletion — an inactivity-based purge is a product
// decision, not a default.
//
// Prisma is imported lazily inside `purgeExpiredRecords` so the pure filter
// builders can be unit-tested without a database.

export const RETENTION = {
  /** Auth codes live 60 seconds; a day covers every legitimate straggler. */
  authCodeDays: 1,
  /** Expired/revoked refresh tokens, kept briefly so a rotation race is debuggable. */
  refreshTokenDays: 7,
  /** Read notifications. */
  readNotificationDays: 90,
  /** Unread notifications — stale alerts a year old inform nobody. */
  unreadNotificationDays: 365,
  /** Rate-limit windows are seconds-to-minutes long; days-old rows are dead. */
  rateLimitDays: 2,
} as const;

/** `days` before `now`, as a Date — the cutoff below which records purge. */
export function retentionCutoff(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/**
 * The `where` filters for each purge, built from a single `now` so a run is
 * internally consistent. Pure: tests assert the retention semantics here
 * without a database.
 */
export function buildPurgeFilters(now: Date) {
  return {
    /** Auth.js sessions past their own expiry. */
    sessions: { expires: { lt: now } },
    /** MCP auth codes: single-use and 60s-lived; anything old is dead weight. */
    mcpAuthCodes: {
      expiresAt: { lt: retentionCutoff(now, RETENTION.authCodeDays) },
    },
    /** MCP refresh tokens that expired or were revoked (rotation revokes too). */
    mcpRefreshTokens: {
      OR: [
        { expiresAt: { lt: retentionCutoff(now, RETENTION.refreshTokenDays) } },
        { revokedAt: { lt: retentionCutoff(now, RETENTION.refreshTokenDays) } },
      ],
    },
    /** Notifications: read ones after 90 days, unread after a year. */
    notifications: {
      OR: [
        { readAt: { lt: retentionCutoff(now, RETENTION.readNotificationDays) } },
        {
          readAt: null,
          createdAt: {
            lt: retentionCutoff(now, RETENTION.unreadNotificationDays),
          },
        },
      ],
    },
    /** Rate-limit windows long since closed. */
    rateLimits: {
      windowStart: { lt: retentionCutoff(now, RETENTION.rateLimitDays) },
    },
  };
}

export interface PurgeResult {
  sessions: number;
  mcpAuthCodes: number;
  mcpRefreshTokens: number;
  notifications: number;
  rateLimits: number;
}

/** Delete everything past its retention. Safe to re-run at any time. */
export async function purgeExpiredRecords(
  now: Date = new Date(),
): Promise<PurgeResult> {
  const { prisma } = await import("@/lib/prisma");
  const filters = buildPurgeFilters(now);
  const [sessions, mcpAuthCodes, mcpRefreshTokens, notifications, rateLimits] =
    await prisma.$transaction([
      prisma.session.deleteMany({ where: filters.sessions }),
      prisma.mcpAuthCode.deleteMany({ where: filters.mcpAuthCodes }),
      prisma.mcpRefreshToken.deleteMany({ where: filters.mcpRefreshTokens }),
      prisma.notification.deleteMany({ where: filters.notifications }),
      prisma.rateLimit.deleteMany({ where: filters.rateLimits }),
    ]);

  return {
    sessions: sessions.count,
    mcpAuthCodes: mcpAuthCodes.count,
    mcpRefreshTokens: mcpRefreshTokens.count,
    notifications: notifications.count,
    rateLimits: rateLimits.count,
  };
}
