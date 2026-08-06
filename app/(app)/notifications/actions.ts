"use server";

import { requireScope } from "@/lib/auth/scope";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { generateNotificationsForUser } from "@/lib/notifications/generate";

// Read state is PER MEMBER (PLAN_MULTIUSER.md phase 5): marking read writes
// the actor's own NotificationRead row, so it's level "read" — a VIEWER
// manages their own bell. Notification.readAt is only kept as the aggregate
// first-read timestamp retention purges on.

// Mark a single notification read for the acting member. A no-op if the
// notification isn't the household's.
export async function markNotificationRead(id: string): Promise<void> {
  const { dataUserId, actorUserId } = await requireScope("read");
  const notification = await prisma.notification.findFirst({
    where: { id, userId: dataUserId },
    select: { id: true, readAt: true },
  });
  if (!notification) return;
  await prisma.$transaction([
    prisma.notificationRead.upsert({
      where: { notificationId_userId: { notificationId: id, userId: actorUserId } },
      create: { notificationId: id, userId: actorUserId },
      update: {},
    }),
    ...(notification.readAt
      ? []
      : [
          prisma.notification.update({
            where: { id },
            data: { readAt: new Date() },
          }),
        ]),
  ]);
  revalidatePath("/", "layout");
}

export async function markAllNotificationsRead(): Promise<void> {
  const { dataUserId, actorUserId } = await requireScope("read");
  const unread = await prisma.notification.findMany({
    where: { userId: dataUserId, reads: { none: { userId: actorUserId } } },
    select: { id: true },
  });
  if (unread.length === 0) return;
  await prisma.$transaction([
    prisma.notificationRead.createMany({
      data: unread.map((n) => ({ notificationId: n.id, userId: actorUserId })),
      skipDuplicates: true,
    }),
    prisma.notification.updateMany({
      where: { id: { in: unread.map((n) => n.id) }, readAt: null },
      data: { readAt: new Date() },
    }),
  ]);
  revalidatePath("/", "layout");
}

// Regenerate the household's notifications on demand (the daily cron does
// this automatically; this gives immediate feedback). Generation mutates
// household state, so it stays a write.
export async function refreshMyNotifications(): Promise<void> {
  const { dataUserId } = await requireScope("write");
  await generateNotificationsForUser(dataUserId);
  revalidatePath("/", "layout");
}
