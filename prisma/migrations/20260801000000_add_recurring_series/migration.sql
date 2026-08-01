-- Recurring payment / subscription detection.
-- Candidates are detected on the fly from transactions; this table stores the
-- user's decision (confirm / ignore) plus a snapshot of the detected cadence and
-- amount for future forecasting and alerts.

-- CreateEnum
CREATE TYPE "RecurringStatus" AS ENUM ('CONFIRMED', 'IGNORED');

-- CreateEnum
CREATE TYPE "RecurringCadence" AS ENUM ('WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'IRREGULAR');

-- CreateTable
CREATE TABLE "recurring_series" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "merchantKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "direction" "TransactionDirection" NOT NULL,
    "categoryId" TEXT,
    "status" "RecurringStatus" NOT NULL,
    "cadence" "RecurringCadence" NOT NULL,
    "averageAmount" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "lastSeenAt" DATE,
    "nextExpectedDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_series_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recurring_series_userId_merchantKey_key" ON "recurring_series"("userId", "merchantKey");

-- AddForeignKey
ALTER TABLE "recurring_series" ADD CONSTRAINT "recurring_series_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_series" ADD CONSTRAINT "recurring_series_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
