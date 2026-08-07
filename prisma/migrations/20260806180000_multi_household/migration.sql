-- Multiuser phase 6-lite (PLAN_MULTIUSER.md): a user can belong to several
-- households. The per-user unique goes away (the composite unique stays);
-- MCP grants record the household that was active at consent time.

-- DropIndex
DROP INDEX "household_members_userId_key";

-- CreateIndex
CREATE INDEX "household_members_userId_idx" ON "household_members"("userId");

-- AlterTable
ALTER TABLE "mcp_auth_codes" ADD COLUMN "householdId" TEXT;

-- AlterTable
ALTER TABLE "mcp_refresh_tokens" ADD COLUMN "householdId" TEXT;
