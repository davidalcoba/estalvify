// Fixed-window rate limiting backed by Postgres.
//
// Why Postgres: Vercel functions share no memory between invocations, so an
// in-process counter resets on every cold start and never sees traffic hitting
// a sibling invocation. The database is the one store every invocation already
// shares. A fixed window (counter resets when the window expires) is the
// simplest scheme that stops brute force and accidental floods; it can let
// through up to 2× the limit across a window boundary, which is fine for the
// abuse profile of these endpoints.
//
// The window math and limit configs are pure (unit-tested); `consumeRateLimit`
// is the one impure entry point — it imports Prisma lazily so this module can
// be unit-tested without a database. It FAILS OPEN on database errors: if
// Postgres is down nothing else works either, and the limiter must not add
// its own outage mode to otherwise-healthy requests.

export interface RateLimitRule {
  /** Maximum requests allowed per window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

/**
 * Per-endpoint limits. Sized for a human-scale multi-user app: generous enough
 * that a legitimate client (an MCP connector refreshing tokens, a user
 * completing a bank connect) never notices, tight enough that credential
 * guessing and registration floods are useless.
 */
export const RATE_LIMITS = {
  /** Token endpoint — protects client-secret + code/refresh-token guessing. */
  "oauth-token": { limit: 30, windowSeconds: 60 },
  /** Authorize endpoint — code minting; session-gated but reachable anonymously. */
  "oauth-authorize": { limit: 30, windowSeconds: 60 },
  /** Dynamic Client Registration — anonymous row writes when DCR is enabled. */
  "oauth-register": { limit: 5, windowSeconds: 3600 },
  /** RFC 7009 revocation — client-authenticated, but keep guessing bounded. */
  "oauth-revoke": { limit: 30, windowSeconds: 60 },
  /** PSD2 callback — anonymous, drives Enable Banking API calls. */
  "banking-callback": { limit: 20, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimiterName = keyof typeof RATE_LIMITS;

/** Storage key for a (limiter, caller) pair. */
export function rateLimitKey(name: RateLimiterName, id: string): string {
  return `${name}:${id}`;
}

/** A window that started at or before this instant is expired. */
export function windowExpiryThreshold(now: Date, windowSeconds: number): Date {
  return new Date(now.getTime() - windowSeconds * 1000);
}

/** Pure decision: given the post-increment count, is the request allowed? */
export function isWithinLimit(count: number, limit: number): boolean {
  return count <= limit;
}

/**
 * Best-effort client IP. On Vercel, `x-forwarded-for`'s first entry is set by
 * the platform and trustworthy; elsewhere it is only as honest as the proxy in
 * front. Callers that have a better identifier (a client_id, a user id) should
 * pass that instead.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Count one request against the (name, id) window. Returns true when the
 * request is allowed, false when the caller is over the limit.
 *
 * Concurrency: the common path is a single atomic increment guarded by the
 * window check; the reset path (expired/missing row) is an upsert where a lost
 * race costs at most one miscounted request.
 */
export async function consumeRateLimit(
  name: RateLimiterName,
  id: string,
): Promise<boolean> {
  const { limit, windowSeconds } = RATE_LIMITS[name];
  const key = rateLimitKey(name, id);
  const now = new Date();
  const threshold = windowExpiryThreshold(now, windowSeconds);

  try {
    const { prisma } = await import("@/lib/prisma");
    const bumped = await prisma.rateLimit.updateMany({
      where: { key, windowStart: { gt: threshold } },
      data: { count: { increment: 1 } },
    });

    if (bumped.count === 0) {
      // Window expired or first request: start a fresh window.
      await prisma.rateLimit.upsert({
        where: { key },
        update: { windowStart: now, count: 1 },
        create: { key, windowStart: now, count: 1 },
      });
      return true;
    }

    const row = await prisma.rateLimit.findUnique({ where: { key } });
    return isWithinLimit(row?.count ?? 1, limit);
  } catch (err) {
    console.warn(
      `[rate-limit] ${name} check failed, allowing request:`,
      err instanceof Error ? err.message : err,
    );
    return true;
  }
}
