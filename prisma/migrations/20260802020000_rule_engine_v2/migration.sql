-- Rule engine v2.
--
-- Two additions, both additive and nullable/defaulted so no backfill is needed:
--
--   1. Per-rule metrics. A rule that matches nothing used to be invisible; the
--      run now records how many rows it claimed (most recent run, not cumulative)
--      and when it last ran / last matched.
--   2. An undo trail on categorizations. A rule run records what it overwrote so
--      undo_rule_run can put it back: previousCategoryId NULL means the rule
--      created the row, so undo deletes it instead of restoring.
--
-- previousCategoryId intentionally has no foreign key — it is a historical value
-- and a since-deleted category must not block reverting a bad run.

-- AlterTable
ALTER TABLE "category_rules"
    ADD COLUMN "matchCount"  INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "lastRunAt"   TIMESTAMP(3),
    ADD COLUMN "lastMatchAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "transaction_categorizations"
    ADD COLUMN "previousCategoryId" TEXT,
    ADD COLUMN "previousSource"     "CategorizationSource",
    ADD COLUMN "categorizedAt"      TIMESTAMP(3);
