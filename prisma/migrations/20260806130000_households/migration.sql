-- Multiuser phase 1 (PLAN_MULTIUSER.md): households as a membership layer over
-- the owner's data scope. Domain tables keep hanging off the OWNER's userId;
-- these tables only decide which userId a session resolves to and with which
-- role.

-- CreateEnum
CREATE TYPE "HouseholdRole" AS ENUM ('OWNER', 'EDITOR', 'VIEWER');

-- CreateTable
CREATE TABLE "households" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "households_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "household_members" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "HouseholdRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "household_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "household_invites" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "HouseholdRole" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "invitedByUserId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "household_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "households_ownerUserId_key" ON "households"("ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "household_members_userId_key" ON "household_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "household_members_householdId_userId_key" ON "household_members"("householdId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "household_invites_tokenHash_key" ON "household_invites"("tokenHash");

-- CreateIndex
CREATE INDEX "household_invites_householdId_idx" ON "household_invites"("householdId");

-- AddForeignKey
ALTER TABLE "households" ADD CONSTRAINT "households_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_invites" ADD CONSTRAINT "household_invites_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: one household per existing user, with the user as its OWNER
-- member. Ids are derived from the user id (TEXT pks, cuid is client-side);
-- idempotent thanks to the unique constraints + ON CONFLICT.
INSERT INTO "households" ("id", "name", "ownerUserId", "createdAt", "updatedAt")
SELECT 'hh_' || "id", 'My household', "id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "users"
ON CONFLICT ("ownerUserId") DO NOTHING;

INSERT INTO "household_members" ("id", "householdId", "userId", "role", "createdAt")
SELECT 'hm_' || u."id", h."id", u."id", 'OWNER', CURRENT_TIMESTAMP
FROM "users" u
JOIN "households" h ON h."ownerUserId" = u."id"
ON CONFLICT ("userId") DO NOTHING;
