-- Add inflow flag to categories table.
-- true  = income category: transactions feed ReadyToAssign, not activity.
-- false = spending category (default): transactions appear as activity in the budget.

ALTER TABLE "categories" ADD COLUMN "inflow" BOOLEAN NOT NULL DEFAULT false;
