-- Sync health alerts.
--
-- CONSENT_EXPIRING is the preventive one: PSD2 consents are granted for a fixed
-- 90 days, so every connection eventually lapses. When it does, every sync
-- producer filters on status = 'ACTIVE' and skips the connection in silence —
-- an outage can run for weeks before anyone notices. Warning ahead of the expiry
-- is what actually prevents that.
--
-- NO_TRANSACTIONS is the safety net for the failure modes that are not an expiry
-- (dead cron, stuck date window, a transactions endpoint returning 404).

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'CONSENT_EXPIRING';
ALTER TYPE "NotificationType" ADD VALUE 'NO_TRANSACTIONS';
