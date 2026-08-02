// Pure classifiers for Enable Banking sync errors, extracted so they can be
// unit-tested and reused by both sync.ts and the queue consumer.
//
// Errors are thrown as `Enable Banking API error <status>: <body>` (see
// enable-banking.ts request()), so we classify on the message string.

/** Daily PSD2 quota exhausted — not retryable, resets next day. */
export function isRateLimitError(msg: string): boolean {
  return msg.includes("429") || msg.includes("ASPSP_RATE_LIMIT") || msg.includes("HUB046");
}

/**
 * Consent/session expired or unauthorized (401/403). The bank consent must be
 * renewed — retrying is pointless, and the whole connection is affected.
 */
export function isAuthError(msg: string): boolean {
  return msg.includes("401") || msg.includes("403") || msg.includes("expired");
}

// Prefixes used to tag accumulated errors so the queue consumer can decide how
// to close out the connection (no retry / mark EXPIRED).
export const RATE_LIMIT_PREFIX = "RATE_LIMIT:";
/**
 * The account has no transactions endpoint (some card/loan products don't).
 * Recorded on the account but never added to the sync's `errors`, so the sync
 * still counts as successful and is not retried — it is a permanent property of
 * the account, not a failure. Kept visible so a permanently history-less account
 * can't be mistaken for a healthy one.
 */
export const UNSUPPORTED_PREFIX = "UNSUPPORTED:";
export const AUTH_ERROR_PREFIX = "AUTH_ERROR:";
