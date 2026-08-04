-- Recurring-series alerts.
--
-- RECURRING_AMOUNT_CHANGE: a confirmed series' latest charge deviated from its
-- usual amount (insurance premiums silently raised 9% and 17% in the history
-- this was designed on — nobody spots that by hand).
--
-- RECURRING_MISSED: a confirmed series' expected charge never arrived. Catches
-- unpaid bills and doubles as another tripwire for a quietly broken sync.

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'RECURRING_AMOUNT_CHANGE';
ALTER TYPE "NotificationType" ADD VALUE 'RECURRING_MISSED';
