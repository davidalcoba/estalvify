// Central queue definitions — topic names and message type contracts.
// All producers and consumers import from here to avoid string/type drift.

export const TOPICS = {
  syncConnection: "banking.sync-connection",
} as const;

/** Payload sent to the banking.sync-connection topic */
export interface SyncConnectionMessage {
  connectionId: string;
  userId: string;
}
