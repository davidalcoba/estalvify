-- Planning model v2 (definitive spec).
--
-- plannedItems become the SOURCE OF TRUTH: recurring series generate dated
-- instances forward, one-offs are typed by hand, and the monthly cascade
-- derives from them. Sinking funds collapse into budget_items.rollover.
-- Recurring series become hand-maintained (at n=1, configuring fifteen known
-- series is cheaper than inferring them), so detection-era columns go and
-- expectedAmount/day-windows arrive. Stock envelopes label the savings balance
-- and stay out of the monthly assignment cycle (stock never mixes with flow).
--
-- Drops: transaction_splits (its use case - cataloguing an ATM withdrawal
-- weeks later - won't happen twice), sinking_funds (now a boolean), plan_items
-- (superseded by recurring_series + planned_items). All three shipped hours
-- ago and hold no meaningful user data.

-- ── Recurring series: manual CRUD shape ─────────────────────────────────────
ALTER TABLE "recurring_series" RENAME COLUMN "averageAmount" TO "expectedAmount";
ALTER TABLE "recurring_series" ADD COLUMN "windowFromDay" INTEGER;
ALTER TABLE "recurring_series" ADD COLUMN "windowToDay" INTEGER;
ALTER TABLE "recurring_series" ADD COLUMN "anchorMonthEnd" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "recurring_series" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

-- An IGNORED decision meant "not a series" in the detection era; in a manual
-- registry those rows are noise.
DELETE FROM "recurring_series" WHERE "status" = 'IGNORED';
ALTER TABLE "recurring_series" DROP COLUMN "status";
DROP TYPE "RecurringStatus";

ALTER TYPE "RecurringCadence" ADD VALUE 'BIMONTHLY';

-- ── Planned items ────────────────────────────────────────────────────────────
CREATE TYPE "PlannedStatus" AS ENUM ('PENDING', 'MATCHED', 'MISSED');

CREATE TABLE "planned_items" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "direction" "TransactionDirection" NOT NULL DEFAULT 'DEBIT',
    "categoryId" TEXT,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "dueDay" INTEGER,
    "windowFromDay" INTEGER,
    "windowToDay" INTEGER,
    "anchorMonthEnd" BOOLEAN NOT NULL DEFAULT false,
    "recurringSeriesId" TEXT,
    "status" "PlannedStatus" NOT NULL DEFAULT 'PENDING',
    "matchedTransactionId" TEXT,
    "matchedAmount" DECIMAL(15,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planned_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "planned_items_matchedTransactionId_key" ON "planned_items"("matchedTransactionId");
CREATE UNIQUE INDEX "planned_items_recurringSeriesId_year_month_key" ON "planned_items"("recurringSeriesId", "year", "month");
CREATE INDEX "planned_items_userId_year_month_idx" ON "planned_items"("userId", "year", "month");

ALTER TABLE "planned_items" ADD CONSTRAINT "planned_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "planned_items" ADD CONSTRAINT "planned_items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "planned_items" ADD CONSTRAINT "planned_items_recurringSeriesId_fkey" FOREIGN KEY ("recurringSeriesId") REFERENCES "recurring_series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Budget items: the rollover boolean IS the sinking fund ──────────────────
ALTER TABLE "budget_items" ADD COLUMN "rollover" BOOLEAN NOT NULL DEFAULT false;

-- ── User config: base income (extraordinary = anything above, by difference) ─
ALTER TABLE "users" ADD COLUMN "baseMonthlyIncome" DECIMAL(15,2);

-- ── Stock envelopes ──────────────────────────────────────────────────────────
CREATE TABLE "stock_envelopes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "locked" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_envelopes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "stock_envelopes_userId_idx" ON "stock_envelopes"("userId");
ALTER TABLE "stock_envelopes" ADD CONSTRAINT "stock_envelopes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Drops ────────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS "transaction_splits";
DROP TABLE IF EXISTS "sinking_funds";
DROP TABLE IF EXISTS "plan_items";
DROP TYPE IF EXISTS "PlanCadence";

-- Account assignment (configuration, not inference): rent leaves Despeses,
-- Mònica's salary lands in Estalvis — the per-account projection needs it.
ALTER TABLE "recurring_series" ADD COLUMN "bankAccountId" TEXT;
ALTER TABLE "planned_items" ADD COLUMN "bankAccountId" TEXT;
