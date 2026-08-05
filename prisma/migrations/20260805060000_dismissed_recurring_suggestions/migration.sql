-- Detection proposes possible recurring series; a dismissed proposal must not
-- resurface on every visit. Keyed by the suggestion's normalized merchantKey.
CREATE TABLE "dismissed_recurring_suggestions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "merchantKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dismissed_recurring_suggestions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dismissed_recurring_suggestions_userId_merchantKey_key"
    ON "dismissed_recurring_suggestions"("userId", "merchantKey");

ALTER TABLE "dismissed_recurring_suggestions"
    ADD CONSTRAINT "dismissed_recurring_suggestions_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
