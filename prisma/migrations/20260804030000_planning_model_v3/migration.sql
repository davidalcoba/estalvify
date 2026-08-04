-- Planning model v3: accounts carry NO semantics.
--
-- No account is "the savings account" — that Estalvis serves as the cushion is
-- a household convention, not a property of the money. Savings stops being a
-- budgeted line or a tracked account and becomes a DERIVED metric: the month's
-- consolidated balance change. The expected monthly RESULT (expected income −
-- expected charges − rollover quotas − variable assignments) is the goal.
-- Expected income comes from CREDIT planned items (the salary series), so the
-- configured base income goes too — the deviation alert on the income series
-- is what flags the annual variables (6.009 € expected, 20.528 € arrives).

-- DropTable
DROP TABLE IF EXISTS "stock_envelopes";

-- AlterTable
ALTER TABLE "users" DROP COLUMN IF EXISTS "savingsGoalAmount";
ALTER TABLE "users" DROP COLUMN IF EXISTS "savingsGoalPercent";
ALTER TABLE "users" DROP COLUMN IF EXISTS "savingsAccountId";
ALTER TABLE "users" DROP COLUMN IF EXISTS "baseMonthlyIncome";
