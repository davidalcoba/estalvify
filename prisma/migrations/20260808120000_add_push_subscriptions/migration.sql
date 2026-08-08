-- Web Push delivery targets, one row per browser/device that opted in.
--
-- Same notifications as the header bell, pushed to the device instead of
-- waiting for the user to open the app. Attached to the member, not to the
-- household anchor: every member should be able to receive the household's
-- alerts on their own phone.
--
-- On iOS these can only be created from an installed (standalone) PWA — Safari
-- does not expose PushManager in a browser tab.

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Globally unique: browsers reissue the same endpoint, so re-subscribing must
-- update the existing row rather than pile up duplicates.
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_userId_idx" ON "push_subscriptions"("userId");

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
