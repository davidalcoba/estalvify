import "server-only";

// Web Push delivery for the notifications that already power the header bell.
//
// Sending stays best-effort — a dead endpoint must never fail the cron run that
// produced the notification — but it is no longer *silent*. The first version
// swallowed every error into console.error, which on Vercel is invisible from
// outside; an Apple rejection looked exactly like "nothing to send". Failures
// now come back to the caller and are recorded on the subscription row, so the
// reason a push did not arrive is visible in the app itself.

import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import type { NotificationSpec } from "./generators";

/** Payload shape read by the `push` handler in public/sw.js. */
export interface PushPayload {
  title: string;
  body: string;
  /** In-app path opened when the notification is tapped. */
  url: string;
  /** Collapses repeats of the same alert in the OS tray. */
  tag: string;
}

export interface PushResult {
  /** Successful deliveries. */
  sent: number;
  /** Devices that rejected the push and were dropped as unreachable. */
  dropped: number;
  /**
   * Human-readable failure reasons, deduplicated. Empty on success. Surfaced in
   * Settings so a misconfigured VAPID subject is diagnosable without log access.
   */
  errors: string[];
}

const EMPTY: PushResult = { sent: 0, dropped: 0, errors: [] };

/**
 * Apple rejects a push outright when the VAPID subject is not a valid `mailto:`
 * or `https:` URI, with an opaque JWT error. Checking it here turns that into a
 * message that says what to fix.
 */
function vapidConfigError(): string | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) {
    return "Push is not configured: the VAPID environment variables are missing.";
  }
  if (!/^(mailto:|https:\/\/)/.test(subject)) {
    return 'VAPID_SUBJECT must start with "mailto:" or "https://". Apple rejects anything else.';
  }
  if (publicKey.length !== 87) {
    return `NEXT_PUBLIC_VAPID_PUBLIC_KEY looks wrong: ${publicKey.length} characters, expected 87.`;
  }
  if (privateKey.length !== 43) {
    return `VAPID_PRIVATE_KEY looks wrong: ${privateKey.length} characters, expected 43.`;
  }
  return null;
}

let configured = false;

/** Configure web-push once. Returns the config error, or null when usable. */
function ensureConfigured(): string | null {
  const problem = vapidConfigError();
  if (problem) return problem;

  if (!configured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT!,
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!,
    );
    configured = true;
  }
  return null;
}

/** Turn a web-push rejection into something a person can act on. */
function describe(error: unknown): string {
  const status = (error as { statusCode?: number }).statusCode;
  const body = (error as { body?: string }).body;
  const message = (error as { message?: string }).message;

  if (status === 403) {
    return `Rejected by the push service (403). Usually a VAPID key/subject mismatch: ${body ?? message ?? ""}`.trim();
  }
  if (status === 400) {
    return `Malformed push request (400): ${body ?? message ?? ""}`.trim();
  }
  if (status === 413) return "Payload too large for the push service (413).";
  if (status === 429) return "Rate-limited by the push service (429).";
  return status
    ? `Push service returned ${status}: ${body ?? message ?? ""}`.trim()
    : `Send failed: ${message ?? String(error)}`;
}

/**
 * Everyone entitled to see notifications anchored at `dataUserId`.
 *
 * Notifications are stored against the household's anchor user (see
 * `lib/auth/scope.ts`) and every member sees them in the bell, so every member
 * should be able to receive them on their phone. The owner is itself a
 * HouseholdMember row, so this covers them.
 */
async function recipientUserIds(dataUserId: string): Promise<string[]> {
  const household = await prisma.household.findUnique({
    where: { ownerUserId: dataUserId },
    select: { members: { select: { userId: true } } },
  });

  if (!household) return [dataUserId];

  const ids = new Set(household.members.map((member) => member.userId));
  ids.add(dataUserId);
  return [...ids];
}

/**
 * Push specs to the devices of the given members, honouring each member's own
 * per-type preferences.
 *
 * Grouped per user rather than per subscription because the filter is personal:
 * two members of a household can want different alerts on their phones.
 */
async function deliver(
  userIds: string[],
  specs: NotificationSpec[],
  // The test button must reach the device even when every type is switched
  // off — otherwise "is push working?" is unanswerable for exactly the users
  // most likely to be debugging it.
  { ignorePreferences = false }: { ignorePreferences?: boolean } = {},
): Promise<PushResult> {
  if (userIds.length === 0 || specs.length === 0) return EMPTY;

  const configError = ensureConfigured();
  if (configError) return { sent: 0, dropped: 0, errors: [configError] };

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId: { in: userIds } },
    include: { user: { select: { pushTypes: true } } },
  });
  if (subscriptions.length === 0) return EMPTY;

  const errors = new Set<string>();
  const stale = new Set<string>();
  let sent = 0;

  await Promise.all(
    subscriptions.flatMap((subscription) => {
      const allowed = new Set(subscription.user.pushTypes);
      return specs
        .filter((spec) => ignorePreferences || allowed.has(spec.type))
        .map(async (spec) => {
          const payload: PushPayload = {
            title: spec.title,
            body: spec.body,
            url: "/notifications",
            tag: spec.dedupeKey,
          };

          try {
            await webpush.sendNotification(
              {
                endpoint: subscription.endpoint,
                keys: {
                  p256dh: subscription.p256dh,
                  auth: subscription.auth,
                },
              },
              JSON.stringify(payload),
            );
            sent += 1;
          } catch (error) {
            const status = (error as { statusCode?: number }).statusCode;
            const reason = describe(error);
            errors.add(reason);
            // 404/410 mean the browser threw the subscription away.
            if (status === 404 || status === 410) {
              stale.add(subscription.endpoint);
            } else {
              // Keep the row, but remember why it failed so Settings can show it.
              await prisma.pushSubscription
                .update({
                  where: { endpoint: subscription.endpoint },
                  data: { lastError: reason, lastErrorAt: new Date() },
                })
                .catch(() => {});
            }
          }
        });
    }),
  );

  if (stale.size > 0) {
    await prisma.pushSubscription.deleteMany({
      where: { endpoint: { in: [...stale] } },
    });
  }

  if (sent > 0 && errors.size === 0) {
    // Clear a stale failure once the same device succeeds again.
    await prisma.pushSubscription
      .updateMany({
        where: { userId: { in: userIds }, lastError: { not: null } },
        data: { lastError: null, lastErrorAt: null },
      })
      .catch(() => {});
  }

  return { sent, dropped: stale.size, errors: [...errors] };
}

/** Push a batch to every member of the household anchored at `dataUserId`. */
export async function sendPushBatch(
  dataUserId: string,
  specs: NotificationSpec[],
): Promise<PushResult> {
  if (specs.length === 0) return EMPTY;
  return deliver(await recipientUserIds(dataUserId), specs);
}

/** Push to one member's own devices — used by the test button in Settings. */
export async function sendPushToSelf(
  userId: string,
  spec: NotificationSpec,
): Promise<PushResult> {
  return deliver([userId], [spec], { ignorePreferences: true });
}
