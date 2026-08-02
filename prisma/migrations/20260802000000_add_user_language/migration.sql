-- Decouple date language from number format: add a dedicated `language` preference.
-- `locale` keeps driving number formatting (formatCurrency); `language` drives date
-- rendering (formatDate). Default to en-GB since the app UI is English; backfill existing
-- rows so dates immediately render in English instead of following the number-format locale.
ALTER TABLE "users" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'en-GB';
UPDATE "users" SET "language" = 'en-GB';
