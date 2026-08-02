-- Link a plan item back to the recurring series it came from.
-- Confirming a detected series now creates its plan item automatically; the
-- unique index keeps that 1:1 (re-confirming updates instead of duplicating,
-- undoing removes exactly one item). NULLs are distinct in Postgres, so
-- manually created plan items are unaffected by the constraint.

-- AlterTable
ALTER TABLE "plan_items" ADD COLUMN "recurringMerchantKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "plan_items_userId_recurringMerchantKey_key" ON "plan_items"("userId", "recurringMerchantKey");
