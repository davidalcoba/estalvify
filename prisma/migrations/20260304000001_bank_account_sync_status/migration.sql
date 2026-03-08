-- AlterTable
ALTER TABLE "bank_accounts" ADD COLUMN "lastSyncAt"    TIMESTAMP(3);
ALTER TABLE "bank_accounts" ADD COLUMN "lastSyncError" TEXT;
