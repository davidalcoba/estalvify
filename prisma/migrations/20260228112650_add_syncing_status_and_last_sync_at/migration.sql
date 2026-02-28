-- AlterEnum
ALTER TYPE "BankConnectionStatus" ADD VALUE 'SYNCING';

-- AlterTable
ALTER TABLE "bank_connections" ADD COLUMN     "lastSyncAt" TIMESTAMP(3);
