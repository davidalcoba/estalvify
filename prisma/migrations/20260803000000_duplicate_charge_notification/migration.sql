-- Possible-duplicate-charge alerts.
--
-- The bank-side id already prevents importing one operation twice
-- (unique(bankAccountId, externalTransactionId)), so this is about the case the
-- import cannot see: the merchant or the bank actually charging twice — a double
-- tap on the terminal, a retried payment that both cleared, a direct debit
-- presented twice. Those are only disputable while they are recent, which is why
-- they are worth a notification rather than a report.

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'DUPLICATE_CHARGE';
