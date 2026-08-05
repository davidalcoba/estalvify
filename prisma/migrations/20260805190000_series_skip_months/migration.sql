-- Calendar months (1-12) a series never bills (school skips August). No
-- planned item is generated for those months, so they can't go phantom-MISSED.
ALTER TABLE "recurring_series"
  ADD COLUMN "skipMonths" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
