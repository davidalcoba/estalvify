-- Category.kind — what a category means for money totals.
--
-- Replaces `isNonComputable`, which had the right intent, was seeded correctly
-- on "Transfers"… and was read by nothing. Zero queries selected it, no UI or
-- MCP path could set it. The practical effect was that no total excluded
-- anything: transfers between the user's own accounts counted as spending, and
-- in the income/expense trend the same movement inflated BOTH sides.
--
-- A boolean also could not say what a category IS, only what it isn't, so it
-- could not catch a DEBIT filed under Income. The enum can.

-- CreateEnum
CREATE TYPE "CategoryKind" AS ENUM ('EXPENSE', 'INCOME', 'TRANSFER');

-- AlterTable
ALTER TABLE "categories"
    ADD COLUMN "kind" "CategoryKind" NOT NULL DEFAULT 'EXPENSE';

-- Backfill TRANSFER: the seeded parent carries isNonComputable, its children do
-- not (seedDefaultCategories only sets the flag on the parent), so match both.
UPDATE "categories" SET "kind" = 'TRANSFER'
WHERE "isNonComputable" = true
   OR "parentId" IN (SELECT "id" FROM "categories" WHERE "isNonComputable" = true);

-- Backfill INCOME by the seeded tree. Name-matched because nothing else marks
-- it; this runs once, against known seed data.
UPDATE "categories" SET "kind" = 'INCOME'
WHERE "name" = 'Income'
   OR "parentId" IN (SELECT "id" FROM "categories" WHERE "name" = 'Income');

-- Everything else stays EXPENSE, which is right for every user-created category.

-- DropColumn
ALTER TABLE "categories" DROP COLUMN "isNonComputable";
