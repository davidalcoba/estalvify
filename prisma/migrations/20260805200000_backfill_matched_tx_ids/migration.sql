-- Invariant: matchedTransactionIds always carries 1..n ids on a matched item —
-- also for single-charge matches. Items matched before the array column
-- existed have [] there while matchedTransactionId is set, forcing consumers
-- to read two fields with different rules (and hiding them from the engine's
-- claimed-transaction set). Heal them; matchedTransactionId stays as the
-- legacy single-value anchor.
UPDATE "planned_items"
SET "matchedTransactionIds" = ARRAY["matchedTransactionId"]
WHERE "matchedTransactionId" IS NOT NULL
  AND cardinality("matchedTransactionIds") = 0;
