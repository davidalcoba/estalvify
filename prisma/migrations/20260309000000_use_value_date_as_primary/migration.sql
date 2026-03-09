-- Use value date as the primary transaction date, remove booking date
-- Fill in any NULL valueDate with bookingDate before dropping it
UPDATE "transactions" SET "valueDate" = "bookingDate" WHERE "valueDate" IS NULL;

-- Make valueDate NOT NULL
ALTER TABLE "transactions" ALTER COLUMN "valueDate" SET NOT NULL;

-- Drop old booking date indexes
DROP INDEX IF EXISTS "transactions_userId_bookingDate_idx";
DROP INDEX IF EXISTS "transactions_bankAccountId_bookingDate_idx";

-- Drop bookingDate column
ALTER TABLE "transactions" DROP COLUMN "bookingDate";

-- Create new indexes on valueDate
CREATE INDEX "transactions_userId_valueDate_idx" ON "transactions"("userId", "valueDate");
CREATE INDEX "transactions_bankAccountId_valueDate_idx" ON "transactions"("bankAccountId", "valueDate");
