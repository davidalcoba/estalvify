// Plain, serializable notification shape for the client bell — no Date/Decimal
// crosses the server→client boundary (mirrors the other *-dto modules).

export type NotificationSeverity = "INFO" | "WARNING" | "ALERT";

export interface NotificationDTO {
  id: string;
  type: string;
  severity: NotificationSeverity;
  title: string;
  body: string;
  read: boolean;
  createdAt: string; // ISO
}

interface NotificationRecordLike {
  id: string;
  type: string;
  severity: NotificationSeverity;
  title: string;
  body: string;
  /** Aggregate first-read timestamp — retention's field, NOT the display state. */
  readAt: Date | null;
  createdAt: Date;
  /**
   * Per-member read rows, pre-filtered to the ACTING member by the caller's
   * query (`reads: { where: { userId: actorUserId } }`). When present, this
   * is the read state; `readAt` is only the legacy fallback for callers that
   * haven't joined it.
   */
  reads?: { id: string }[];
}

export function toNotificationDTO(n: NotificationRecordLike): NotificationDTO {
  return {
    id: n.id,
    type: n.type,
    severity: n.severity,
    title: n.title,
    body: n.body,
    read: n.reads ? n.reads.length > 0 : n.readAt !== null,
    createdAt: n.createdAt.toISOString(),
  };
}

/**
 * Short "how long ago" label. Shared by the bell and the notifications page so
 * the same notification never reads as two different ages.
 */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const diffMs = Math.max(0, now - new Date(iso).getTime());
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
