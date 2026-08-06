-- v4: monthly savings goal as an INPUT (the variable budget is the residue).
-- Per month, so the progression stays on record.
ALTER TABLE "budgets"
  ADD COLUMN "savingsTarget" DECIMAL(15,2) NOT NULL DEFAULT 0;
