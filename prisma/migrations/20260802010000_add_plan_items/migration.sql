-- Manual cash-flow planning: standing user-authored income/expense entries with a
-- cadence. The Plan replaces manual Budget entry as the single place to declare
-- intent; a category's planned monthly total acts as its limit and the Forecast
-- projects from these entries.

-- CreateEnum
CREATE TYPE "PlanCadence" AS ENUM ('WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'ONE_OFF');

-- CreateTable
CREATE TABLE "plan_items" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT,
    "direction" "TransactionDirection" NOT NULL,
    "categoryId" TEXT,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "cadence" "PlanCadence" NOT NULL,
    "dayOfMonth" INTEGER,
    "onDate" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plan_items_userId_idx" ON "plan_items"("userId");

-- AddForeignKey
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed: carry each user's most-recent monthly budget forward as MONTHLY expense
-- plan items so nothing already entered is lost. Older budgets and the budget
-- tables are left intact (non-destructive); the app just stops using them.
INSERT INTO "plan_items" ("id", "userId", "label", "direction", "categoryId", "amount", "currency", "cadence", "active", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    b."userId",
    NULL,
    'DEBIT',
    bi."categoryId",
    bi."plannedAmount",
    bi."currency",
    'MONTHLY',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "budget_items" bi
JOIN "budgets" b ON b."id" = bi."budgetId"
JOIN (
    SELECT "userId", MAX("year" * 12 + "month") AS ym
    FROM "budgets"
    GROUP BY "userId"
) latest ON latest."userId" = b."userId" AND (b."year" * 12 + b."month") = latest.ym;
