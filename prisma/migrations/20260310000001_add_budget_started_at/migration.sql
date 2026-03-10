-- Add budgetStartedAt to users table.
-- Stores the first day of the month when the user made their first budget
-- assignment. All budget calculations are scoped to transactions >= this date.
-- NULL means the user has not started budgeting yet (everything shows as 0).

ALTER TABLE "users" ADD COLUMN "budgetStartedAt" TIMESTAMP(3);
