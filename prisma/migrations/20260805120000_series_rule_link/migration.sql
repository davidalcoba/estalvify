-- A series can point at a categorization rule and reuse its condition tree
-- for arrival recognition; the category then comes from the rule.
ALTER TABLE "recurring_series" ADD COLUMN "ruleId" TEXT;

ALTER TABLE "recurring_series"
    ADD CONSTRAINT "recurring_series_ruleId_fkey"
    FOREIGN KEY ("ruleId") REFERENCES "category_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
