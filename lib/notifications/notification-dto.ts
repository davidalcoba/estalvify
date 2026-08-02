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
  readAt: Date | null;
  createdAt: Date;
}

export function toNotificationDTO(n: NotificationRecordLike): NotificationDTO {
  return {
    id: n.id,
    type: n.type,
    severity: n.severity,
    title: n.title,
    body: n.body,
    read: n.readAt !== null,
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
