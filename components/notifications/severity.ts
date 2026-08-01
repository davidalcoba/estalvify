import { Info, AlertTriangle, AlertCircle, type LucideIcon } from "lucide-react";
import type { NotificationSeverity } from "@/lib/notifications/notification-dto";

// Icon + semantic-token color per severity. Shared so the bell stays consistent.
export const severityIcon: Record<NotificationSeverity, LucideIcon> = {
  INFO: Info,
  WARNING: AlertTriangle,
  ALERT: AlertCircle,
};

export const severityColor: Record<NotificationSeverity, string> = {
  INFO: "text-muted-foreground",
  WARNING: "text-warning",
  ALERT: "text-destructive",
};
