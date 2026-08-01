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
