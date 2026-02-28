-- AlterTable
ALTER TABLE "users" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'EUR',
ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'es-ES',
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Europe/London';
