-- Sinking funds: provision monthly for foreseeable non-monthly expenses.
--
-- The 716 € garage bill, July's 800 € of holidays, September's back-to-school
-- — and the IBI, which shows up in NO transaction of the last 8 months and is
-- coming regardless. A fund's monthly contribution joins the month's
-- commitments (next to the savings goal), so the lump hit stops wrecking the
-- month it lands in. Internal accounting over the savings balance; the accrued
-- amount is computed from startDate/initialAmount/monthlyContribution, capped
-- at targetAmount — no cron writes.

-- CreateTable
CREATE TABLE "sinking_funds" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetAmount" DECIMAL(15,2) NOT NULL,
    "targetDate" DATE,
    "monthlyContribution" DECIMAL(15,2) NOT NULL,
    "startDate" DATE NOT NULL,
    "initialAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sinking_funds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sinking_funds_userId_idx" ON "sinking_funds"("userId");

-- AddForeignKey
ALTER TABLE "sinking_funds" ADD CONSTRAINT "sinking_funds_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
