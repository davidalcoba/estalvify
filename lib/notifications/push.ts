import "server-only";

// Web Push delivery for the notifications that already power the header bell.
//
// Sending is strictly best-effort: a dead endpoint or a missing VAPID key must
// never fail the cron run that produced the notification. The in-app bell is
// the source of truth; push is a courtesy on top.

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

let configured: boolean | null = null;

/**
 * Configure web-push once. Returns false when VAPID keys are absent, which is
 * the normal state in local dev and on deploys where push is not set up —-
 * callers then skip sending instead of throwing.
 */
function ensureConfigured(): boolean {
  if (configured !== null) return configured;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) {
    configured = false;
    return false;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

/**
 * Everyone entitled to see notifications anchored at `dataUserId`.
 *
 * Notifications are stored against the household's anchor user (see
 * `lib/auth/scope.ts`), and every member sees them in the bell — so every
 * member should be able to receive them on their phone too, not just the owner.
 * The owner is itself a HouseholdMember row, so this covers them.
 */
async function recipientUserIds(dataUserId: string): Promise<string[]> {
  const household = await prisma.household.findUnique({
    where: { ownerUserId: dataUserId },
    select: { members: { select: { userId: true } } },
  });

  if (!household) return [dataUserId];

  const ids = new Set(household.members.map((member) => member.userId));
  // Defensive: the anchor must always be a recipient even if its member row
  // were ever missing.
  ids.add(dataUserId);
  return [...ids];
}

/**
 * Push a batch of notifications to every device of every household member.
 *
 * Endpoints the push service reports as gone (404/410) are deleted: the browser
 * discarded that subscription, and retrying them forever would slow every
 * later run.
 */
export async function sendPushBatch(
  dataUserId: string,
  specs: NotificationSpec[],
): Promise<void> {
  if (specs.length === 0) return;
  if (!ensureConfigured()) return;

  const userIds = await recipientUserIds(dataUserId);
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId: { in: userIds } },
  });
  if (subscriptions.length === 0) return;

  const stale = new Set<string>();

  await Promise.all(
    subscriptions.flatMap((subscription) =>
      specs.map(async (spec) => {
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
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            JSON.stringify(payload),
          );
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            stale.add(subscription.endpoint);
          } else {
            console.error("[push] send failed:", error);
          }
        }
      }),
    ),
  );

  if (stale.size > 0) {
    await prisma.pushSubscription.deleteMany({
      where: { endpoint: { in: [...stale] } },
    });
  }
}
