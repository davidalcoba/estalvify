-- Aggregate matching: a planned item can absorb several charges of the same
-- series within its window (school fees, association dues). Record every
-- matched transaction id here; matchedTransactionId keeps the primary (earliest)
-- for the unique-anchor invariant, and matchedAmount holds their sum.
ALTER TABLE "planned_items"
  ADD COLUMN "matchedTransactionIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Opt-in per series: when true, the series' planned items sum every recognized
-- arrival in the window instead of expecting a single charge.
ALTER TABLE "recurring_series"
  ADD COLUMN "aggregate" BOOLEAN NOT NULL DEFAULT false;
