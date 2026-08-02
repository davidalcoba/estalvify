"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "@/components/ui/dropdown-menu";
import { relativeTime, type NotificationDTO } from "@/lib/notifications/notification-dto";
import {
  markNotificationRead,
  markAllNotificationsRead,
  refreshMyNotifications,
} from "@/app/(app)/notifications/actions";
import { useAction } from "@/lib/use-action";
import { severityIcon, severityColor } from "./severity";

export function NotificationBell({
  notifications,
  unreadCount,
}: {
  notifications: NotificationDTO[];
  unreadCount: number;
}) {
  const router = useRouter();
  const { run: runAction, pending, busy } = useAction();
  const [open, setOpen] = useState(false);

  function run(key: string, action: () => Promise<void>) {
    runAction(key, async () => {
      try {
        await action();
        router.refresh();
      } catch {
        // A refresh will restore the true state.
      }
    });
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="brand"
              className="absolute -right-0.5 -top-0.5 h-4 min-w-4 justify-center px-1 text-[10px] leading-none"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-[min(92vw,22rem)] p-0">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-sm font-medium">Notifications</span>
          {unreadCount > 0 && (
            <button
              onClick={() => run("mark-all", markAllNotificationsRead)}
              disabled={pending}
              aria-busy={busy("mark-all") || undefined}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {busy("mark-all") ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCheck className="h-3.5 w-3.5" />
              )}
              Mark all read
            </button>
          )}
        </div>

        <div className="max-h-80 overflow-y-auto border-t">
          {notifications.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              You&apos;re all caught up.
            </p>
          ) : (
            notifications.map((n) => {
              const Icon = severityIcon[n.severity];
              return (
                <button
                  key={n.id}
                  onClick={() => !n.read && run(n.id, () => markNotificationRead(n.id))}
                  disabled={pending}
                  aria-busy={busy(n.id) || undefined}
                  className={`flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-accent disabled:opacity-70 ${
                    n.read ? "" : "bg-accent/40"
                  }`}
                >
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${severityColor[n.severity]}`} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{n.title}</span>
                      {/* The unread dot doubles as the row's progress indicator. */}
                      {busy(n.id) ? (
                        <Loader2 className="ml-auto size-3 shrink-0 animate-spin text-brand" />
                      ) : (
                        !n.read && (
                          <span
                            className="ml-auto size-2 shrink-0 rounded-full bg-brand"
                            aria-label="Unread"
                          />
                        )
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{n.body}</span>
                    <span className="mt-1 block text-[11px] text-muted-foreground/70">
                      {relativeTime(n.createdAt)}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="border-t px-3 py-2">
          <button
            onClick={() => run("refresh", refreshMyNotifications)}
            disabled={pending}
            aria-busy={busy("refresh") || undefined}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${busy("refresh") ? "animate-spin" : ""}`} />
            Check now
          </button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
