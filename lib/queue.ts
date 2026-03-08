// Central queue definitions — topic names and message type contracts.
// All producers and consumers import from here to avoid string/type drift.

export const TOPICS = {
  syncConnection: "sync-connection",
} as const;

/** Payload sent to the sync-connection topic.
 *
 * Two phases:
 *   1. Fan-out  (accountId absent): consumer sets connection to SYNCING and
 *      re-enqueues one message per account.
 *   2. Per-account (accountId present): consumer syncs that single account.
 *      syncStartedAt + totalAccounts allow the last account to close out the
 *      connection status without any extra coordination table.
 */
export interface SyncConnectionMessage {
  connectionId: string;
  userId: string;
  /** If set, only sync this specific bankAccount.id */
  accountId?: string;
  /** ISO timestamp recorded when the fan-out phase ran */
  syncStartedAt?: string;
  /** Total active accounts for this connection, for completion detection */
  totalAccounts?: number;
}
