-- Hot-path indexes (audit A6) + scope the bank account uid per user (audit B2).
-- All statements are idempotent so a re-run or a partially-applied deploy is safe.

-- Categories: read on almost every page (user's own OR system defaults).
CREATE INDEX IF NOT EXISTS "categories_userId_idx" ON "categories"("userId");

-- Rules: loaded per user, ordered by priority, on every run and list render.
CREATE INDEX IF NOT EXISTS "category_rules_userId_priority_idx" ON "category_rules"("userId", "priority");

-- Categorizations: grouped by category and looked up / detached by rule.
CREATE INDEX IF NOT EXISTS "transaction_categorizations_categoryId_idx" ON "transaction_categorizations"("categoryId");
CREATE INDEX IF NOT EXISTS "transaction_categorizations_categoryRuleId_idx" ON "transaction_categorizations"("categoryRuleId");

-- Bank connections: listed per user; the daily cron scans by status.
CREATE INDEX IF NOT EXISTS "bank_connections_userId_idx" ON "bank_connections"("userId");
CREATE INDEX IF NOT EXISTS "bank_connections_status_idx" ON "bank_connections"("status");

-- Bank accounts: filtered by user and by connection (completion count, fan-out).
CREATE INDEX IF NOT EXISTS "bank_accounts_userId_idx" ON "bank_accounts"("userId");
CREATE INDEX IF NOT EXISTS "bank_accounts_bankConnectionId_idx" ON "bank_accounts"("bankConnectionId");

-- B2: externalAccountId was globally unique, which let one user's upsert retarget
-- another user's account row. Make it unique *per user* instead. The bank uid is
-- only globally unique in practice, so no existing row violates the new constraint.
DROP INDEX IF EXISTS "bank_accounts_externalAccountId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "bank_accounts_userId_externalAccountId_key" ON "bank_accounts"("userId", "externalAccountId");
