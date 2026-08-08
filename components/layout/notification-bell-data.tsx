// Loads the bell's data. Rendered by the app shell inside a Suspense boundary,
// so these two queries no longer sit between the user and a painted screen.
//
// They are the heavier half of what the layout used to await: a 20-row findMany
// plus a count with a nested relation filter. On a cold start — installed app,
// serverless cold function, Neon waking up — that was seconds of blank screen.

import { prisma } from "@/lib/prisma";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { toNotificationDTO } from "@/lib/notifications/notification-dto";

export async function NotificationBellData({
  dataUserId,
  actorUserId,
}: {
  /** The household the notifications belong to. */
  dataUserId: string;
  /** The signed-in member, whose read state this is. */
  actorUserId: string;
}) {
  const [rows, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: dataUserId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        type: true,
        severity: true,
        title: true,
        body: true,
        readAt: true,
        createdAt: true,
        // Read state is the ACTING member's, not the household's.
        reads: { where: { userId: actorUserId }, select: { id: true } },
      },
    }),
    prisma.notification.count({
      where: { userId: dataUserId, reads: { none: { userId: actorUserId } } },
    }),
  ]);

  return (
    <NotificationBell
      notifications={rows.map(toNotificationDTO)}
      unreadCount={unreadCount}
    />
  );
}
