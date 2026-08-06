-- Multiuser phase 5 (PLAN_MULTIUSER.md): per-member read state for the shared
-- household bell. Notification.readAt survives as the AGGREGATE first-read
-- timestamp retention purges on; the UI reads notification_reads.

-- CreateTable
CREATE TABLE "notification_reads" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_reads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_reads_notificationId_userId_key" ON "notification_reads"("notificationId", "userId");

-- CreateIndex
CREATE INDEX "notification_reads_userId_idx" ON "notification_reads"("userId");

-- AddForeignKey
ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: a notification already marked read was read by the household
-- owner (the only member until now). Idempotent via the unique constraint.
INSERT INTO "notification_reads" ("id", "notificationId", "userId", "readAt")
SELECT 'nr_' || n."id", n."id", n."userId", n."readAt"
FROM "notifications" n
WHERE n."readAt" IS NOT NULL
ON CONFLICT ("notificationId", "userId") DO NOTHING;
