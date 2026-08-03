-- Daily cash-flow projection (30/60 days, per account).
--
-- The threshold under which a projected balance triggers an alert. Kept on the
-- user: the pain this feature answers is "will Despeses cover the rent before
-- the salary lands", and how much cushion counts as trouble is personal.

-- AlterTable
ALTER TABLE "users" ADD COLUMN "lowBalanceThreshold" DECIMAL(15,2) NOT NULL DEFAULT 0;
