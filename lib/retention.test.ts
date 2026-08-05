import { describe, it, expect } from "vitest";
import { RETENTION, retentionCutoff, buildPurgeFilters } from "./retention";

const NOW = new Date("2026-08-05T12:00:00Z");

describe("retentionCutoff", () => {
  it("subtracts whole days", () => {
    expect(retentionCutoff(NOW, 1).toISOString()).toBe(
      "2026-08-04T12:00:00.000Z",
    );
    expect(retentionCutoff(NOW, 90).toISOString()).toBe(
      "2026-05-07T12:00:00.000Z",
    );
  });
});

describe("buildPurgeFilters", () => {
  const filters = buildPurgeFilters(NOW);

  it("purges sessions only past their own expiry — never live ones", () => {
    expect(filters.sessions).toEqual({ expires: { lt: NOW } });
  });

  it("keeps refresh tokens for the debug window after expiry/revocation", () => {
    const cutoff = retentionCutoff(NOW, RETENTION.refreshTokenDays);
    expect(filters.mcpRefreshTokens.OR).toEqual([
      { expiresAt: { lt: cutoff } },
      { revokedAt: { lt: cutoff } },
    ]);
  });

  it("treats read and unread notifications differently", () => {
    const [read, unread] = filters.notifications.OR;
    expect(read).toEqual({
      readAt: { lt: retentionCutoff(NOW, RETENTION.readNotificationDays) },
    });
    // Unread must be BOTH unread and old — `readAt: null` alone would wipe
    // every unread notification.
    expect(unread).toEqual({
      readAt: null,
      createdAt: {
        lt: retentionCutoff(NOW, RETENTION.unreadNotificationDays),
      },
    });
    expect(RETENTION.unreadNotificationDays).toBeGreaterThan(
      RETENTION.readNotificationDays,
    );
  });

  it("purges rate-limit rows well after any configured window", () => {
    expect(filters.rateLimits).toEqual({
      windowStart: { lt: retentionCutoff(NOW, RETENTION.rateLimitDays) },
    });
  });
});
