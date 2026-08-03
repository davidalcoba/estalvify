-- Savings as a commitment, not a residue.
--
-- The savings goal (fixed € or % of fixed income) enters the month's
-- commitments next to rent and the mortgage, and the variable budget is what
-- remains AFTER it. Real savings is measured as the savings account's net
-- balance change, never as the sum of transfers — a transfer that bounces back
-- to cover rent is churn.
--
-- SAVINGS_NOT_EXECUTED warns near month end when the goal is set but no
-- transfer into the savings account has landed (the app cannot move money; the
-- standing order lives at the bank — detecting that it didn't run is its job).

-- AlterTable
ALTER TABLE "users" ADD COLUMN "savingsGoalAmount" DECIMAL(15,2);
ALTER TABLE "users" ADD COLUMN "savingsGoalPercent" DECIMAL(5,2);
ALTER TABLE "users" ADD COLUMN "savingsAccountId" TEXT;

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'SAVINGS_NOT_EXECUTED';
