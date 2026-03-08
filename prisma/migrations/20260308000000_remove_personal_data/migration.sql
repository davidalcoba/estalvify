-- Remove personal data fields from transactions and bank_accounts
-- - creditorName, debtorName: names of third parties (personal data)
-- - rawData: full raw API response (contained all of the above and more)
-- - bban: never populated, redundant with iban
-- - iban (bank_accounts): now stores only last 4 digits — existing rows truncated
-- - creditorIban, debtorIban (transactions): now store only last 4 digits — existing rows truncated

-- Drop personal name columns from transactions
ALTER TABLE "transactions" DROP COLUMN IF EXISTS "creditorName";
ALTER TABLE "transactions" DROP COLUMN IF EXISTS "debtorName";

-- Drop raw API dump from transactions
ALTER TABLE "transactions" DROP COLUMN IF EXISTS "rawData";

-- Drop bban from bank_accounts (never populated)
ALTER TABLE "bank_accounts" DROP COLUMN IF EXISTS "bban";

-- Truncate existing IBAN values to last 4 digits
UPDATE "bank_accounts"
SET "iban" = RIGHT("iban", 4)
WHERE "iban" IS NOT NULL AND LENGTH("iban") > 4;

UPDATE "transactions"
SET "creditorIban" = RIGHT("creditorIban", 4)
WHERE "creditorIban" IS NOT NULL AND LENGTH("creditorIban") > 4;

UPDATE "transactions"
SET "debtorIban" = RIGHT("debtorIban", 4)
WHERE "debtorIban" IS NOT NULL AND LENGTH("debtorIban") > 4;
