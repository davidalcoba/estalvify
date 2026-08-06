-- Multiuser phase 5 (PLAN_MULTIUSER.md): record WHICH member performed a
-- manual mutation. Nullable, no FK (historical value — a removed member must
-- not block or cascade). Null = pre-audit rows, system paths and MCP writes.

ALTER TABLE "transaction_categorizations" ADD COLUMN "actorUserId" TEXT;
ALTER TABLE "category_rules" ADD COLUMN "actorUserId" TEXT;
ALTER TABLE "planned_items" ADD COLUMN "actorUserId" TEXT;
ALTER TABLE "recurring_series" ADD COLUMN "actorUserId" TEXT;
