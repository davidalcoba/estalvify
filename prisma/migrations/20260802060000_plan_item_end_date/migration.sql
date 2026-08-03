-- Optional end date for a periodic plan item (fixed-term loan, contract that
-- expires). Inclusive of its own month: the item counts up to and including the
-- month the date falls in, and nothing after. NULL = open-ended, which is what
-- every existing item becomes.

-- AlterTable
ALTER TABLE "plan_items" ADD COLUMN "endDate" DATE;
