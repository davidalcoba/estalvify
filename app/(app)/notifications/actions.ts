"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { generateNotificationsForUser } from "@/lib/notifications/generate";

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  return session.user.id;
}

// Mark a single notification read. Scoped by userId; a no-op if already read or
// not owned by the user.
export async function markNotificationRead(id: string): Promise<void> {
  const userId = await requireUserId();
  await prisma.notification.updateMany({
    where: { id, userId, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/", "layout");
}

export async function markAllNotificationsRead(): Promise<void> {
  const userId = await requireUserId();
  await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/", "layout");
}

// Regenerate the user's notifications on demand (the daily cron does this
// automatically; this gives immediate feedback).
export async function refreshMyNotifications(): Promise<void> {
  const userId = await requireUserId();
  await generateNotificationsForUser(userId);
  revalidatePath("/", "layout");
}
