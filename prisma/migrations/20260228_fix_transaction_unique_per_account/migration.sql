-- Drop the global unique constraint on externalTransactionId.
-- A bank may reuse the same transaction IDs across different accounts,
-- so uniqueness must be scoped to (bankAccountId, externalTransactionId).
ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_externalTransactionId_key";

-- Add the compound unique constraint.
CREATE UNIQUE INDEX IF NOT EXISTS "transactions_bankAccountId_externalTransactionId_key"
  ON "transactions"("bankAccountId", "externalTransactionId");
