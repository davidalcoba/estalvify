-- Add CategoryTarget and ScheduledTransaction models for YNAB-style budget system

-- ─────────────────────────────────────────────
-- Enums
-- ─────────────────────────────────────────────

CREATE TYPE "TargetType" AS ENUM ('MONTHLY', 'YEARLY', 'SPECIFIC_MONTHS');
CREATE TYPE "RepeatRule" AS ENUM ('NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY', 'CUSTOM');

-- ─────────────────────────────────────────────
-- CategoryTarget — per-user target for a category
-- ─────────────────────────────────────────────

CREATE TABLE "category_targets" (
    "id"             TEXT NOT NULL,
    "userId"         TEXT NOT NULL,
    "categoryId"     TEXT NOT NULL,
    "targetType"     "TargetType" NOT NULL,
    "amount"         DECIMAL(15,2) NOT NULL,
    "currency"       TEXT NOT NULL DEFAULT 'EUR',
    "dueMonth"       INTEGER,
    "specificMonths" JSONB,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "category_targets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "category_targets_userId_categoryId_key"
    ON "category_targets"("userId", "categoryId");

ALTER TABLE "category_targets"
    ADD CONSTRAINT "category_targets_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "category_targets"
    ADD CONSTRAINT "category_targets_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────
-- ScheduledTransaction — future/recurring transactions
-- ─────────────────────────────────────────────

CREATE TABLE "scheduled_transactions" (
    "id"             TEXT NOT NULL,
    "userId"         TEXT NOT NULL,
    "payeeName"      TEXT NOT NULL,
    "amount"         DECIMAL(15,2) NOT NULL,
    "currency"       TEXT NOT NULL DEFAULT 'EUR',
    "direction"      "TransactionDirection" NOT NULL,
    "categoryId"     TEXT,
    "bankAccountId"  TEXT NOT NULL,
    "nextDate"       DATE NOT NULL,
    "repeatRule"     "RepeatRule" NOT NULL,
    "repeatInterval" INTEGER,
    "notes"          TEXT,
    "isActive"       BOOLEAN NOT NULL DEFAULT true,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_transactions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "scheduled_transactions"
    ADD CONSTRAINT "scheduled_transactions_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "scheduled_transactions"
    ADD CONSTRAINT "scheduled_transactions_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "scheduled_transactions"
    ADD CONSTRAINT "scheduled_transactions_bankAccountId_fkey"
    FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
