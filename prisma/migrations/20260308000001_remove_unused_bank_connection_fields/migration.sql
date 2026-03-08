-- Remove fields from bank_connections that are either always NULL or temporary:
--   sessionData     - temporary account list during OAuth setup, cleared after setup
--   accessToken     - never populated (Enable Banking uses session tokens, not OAuth tokens)
--   refreshToken    - never populated
--   tokenExpiresAt  - never populated
--   lastSyncAt      - redundant: sync window is driven by bank_accounts.lastSyncAt
--   lastSyncError   - redundant: account-level errors are stored on bank_accounts
--
-- Add dedicated column for reconnect flow (previously abused sessionData for this):
--   reconnectConnectionId - set during PENDING_REAUTH when re-authing an existing connection

ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "sessionData";
ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "accessToken";
ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "refreshToken";
ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "tokenExpiresAt";
ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "lastSyncAt";
ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "lastSyncError";

ALTER TABLE "bank_connections" ADD COLUMN IF NOT EXISTS "reconnectConnectionId" TEXT;

-- Temporary account list for the PENDING_SETUP window only (cleared after setup)
ALTER TABLE "bank_connections" ADD COLUMN IF NOT EXISTS "pendingAccounts" JSONB;
