// Notifications page — the full history behind the header bell.
//
// The bell only holds the 20 most recent with no paging, and a notification
// never re-fires (generation upserts by dedupeKey and leaves existing rows
// alone), so anything that scrolled past 20 was unreachable. That gets worse
// with the sync alerts, which can produce several per outage.

import type { Metadata } from "next";
import { requireScope } from "@/lib/auth/scope";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { NotificationList } from "@/components/notifications/notification-list";
import { toNotificationDTO } from "@/lib/notifications/notification-dto";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("nav.notifications") };
}

const PAGE_SIZE = 25;

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ unread?: string; page?: string }>;
}) {
  const scope = await requireScope("read");
  const t = await getT();
  const userId = scope.dataUserId;

  const params = await searchParams;
  const unreadOnly = params.unread === "1";
  const page = Math.max(1, Number(params.page) || 1);

  // "Unread" is the acting member's read state, not the household's.
  const unreadFilter = { reads: { none: { userId: scope.actorUserId } } };
  const where = { userId, ...(unreadOnly ? unreadFilter : {}) };

  const [rows, unreadCount, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        type: true,
        severity: true,
        title: true,
        body: true,
        readAt: true,
        createdAt: true,
        reads: {
          where: { userId: scope.actorUserId },
          select: { id: true },
        },
      },
    }),
    prisma.notification.count({ where: { userId, ...unreadFilter } }),
    prisma.notification.count({ where }),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader title={t("nav.notifications")} />

      <NotificationList
        notifications={rows.map(toNotificationDTO)}
        unreadCount={unreadCount}
        unreadOnly={unreadOnly}
        page={page}
        hasMore={total - page * PAGE_SIZE}
      />
    </div>
  );
}
