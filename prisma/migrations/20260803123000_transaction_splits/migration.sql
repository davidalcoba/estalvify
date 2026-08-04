-- Transaction splits: break one bank row into lines.
--
-- Two real problems need this. (1) ~7% of spending has no traceability — cash
-- withdrawals and monthly credit-card settlements arrive as one opaque amount;
-- splitting them into categorized lines is the only way to see inside. (2) The
-- April salary arrives as ONE row holding base + a 14.5k variable; a rule can
-- categorize a row but can never divide an amount, so base-income math needs
-- the split (isExtraordinary marks the excess).
--
-- The bank row stays immutable; splits sit next to it and take over category
-- aggregation when present. Lines must sum to the parent amount (action-level).

-- CreateTable
CREATE TABLE "transaction_splits" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "categoryId" TEXT,
    "note" TEXT,
    "isExtraordinary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transaction_splits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transaction_splits_transactionId_idx" ON "transaction_splits"("transactionId");
CREATE INDEX "transaction_splits_userId_idx" ON "transaction_splits"("userId");

-- AddForeignKey
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
