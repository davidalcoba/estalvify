-- Extraordinary income as an event.
--
-- The annual variables arrive INSIDE the ordinary salary row (April: 14.5k on
-- top of a 6k base), so a 6-month income average overstates fixed income by
-- thousands and any budget built on it breaks. Detection compares an income
-- series' latest arrival against the median of its previous ones; the alert
-- asks the user to split the row (base + isExtraordinary line) and assign the
-- excess before the month absorbs it.

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'EXTRAORDINARY_INCOME';
