-- Household holders.
--
-- Two salaries from two employers into two accounts, two credit cards, and
-- cross-holder transfers: the data is a household's, but nothing said whose
-- each account was. ownerName is a free-text reporting dimension — the
-- consolidated household view stays the default, holder transfers already
-- never count as income/expense (Category.kind TRANSFER), and this enables the
-- income-concentration indicator (73% of the fixed income here rides on one
-- person — the household's real structural risk).

-- AlterTable
ALTER TABLE "bank_accounts" ADD COLUMN "ownerName" TEXT;
