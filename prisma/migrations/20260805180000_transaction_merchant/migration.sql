-- Clean merchant name extracted from the raw bank descriptor, for display and
-- detection grouping (matching still uses description/remittanceInfo).
ALTER TABLE "transactions" ADD COLUMN "merchant" TEXT;
