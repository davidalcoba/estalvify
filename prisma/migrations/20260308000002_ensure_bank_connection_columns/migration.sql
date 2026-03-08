-- Ensure columns added in 20260308000001 actually exist in the database.
-- That migration may have been marked as applied before the ADD COLUMN
-- statements ran (e.g. a failed build that committed the migration record
-- but not the DDL). Using IF NOT EXISTS makes this safe to run regardless.
ALTER TABLE "bank_connections" ADD COLUMN IF NOT EXISTS "reconnectConnectionId" TEXT;
ALTER TABLE "bank_connections" ADD COLUMN IF NOT EXISTS "pendingAccounts" JSONB;
