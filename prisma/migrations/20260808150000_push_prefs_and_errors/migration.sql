-- Make push delivery diagnosable, and let each member choose what reaches
-- their phone.
--
-- lastError/lastErrorAt: the first version swallowed every send failure into a
-- server log, so an Apple rejection (a malformed VAPID subject returns an
-- opaque JWT error) was indistinguishable from "nothing to send". Recording it
-- on the row makes the reason visible in Settings.
--
-- users.pushTypes: which alert types may vibrate this member's phone. Personal
-- rather than per household — two people can want different lock screens.
-- Default empty so nobody starts receiving push without opting in; the toggle
-- fills it in.

-- AlterTable
ALTER TABLE "push_subscriptions" ADD COLUMN "lastError" TEXT;
ALTER TABLE "push_subscriptions" ADD COLUMN "lastErrorAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN "pushTypes" "NotificationType"[] DEFAULT ARRAY[]::"NotificationType"[];
