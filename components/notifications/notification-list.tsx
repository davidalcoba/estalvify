"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { relativeTime, type NotificationDTO } from "@/lib/notifications/notification-dto";
import {
  markNotificationRead,
  markAllNotificationsRead,
  refreshMyNotifications,
} from "@/app/(app)/notifications/actions";
import { severityIcon, severityColor } from "./severity";

interface NotificationListProps {
  notifications: NotificationDTO[];
  unreadCount: number;
  unreadOnly: boolean;
  page: number;
  hasMore: number;
}

export function NotificationList({
  notifications,
  unreadCount,
  unreadOnly,
  page,
  hasMore,
}: NotificationListProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<void>) {
    startTransition(async () => {
      try {
        await action();
        router.refresh();
      } catch {
        // A refresh will restore the true state.
      }
    });
  }

  function go(next: { unread?: boolean; page?: number }) {
    const params = new URLSearchParams();
    const unread = next.unread ?? unreadOnly;
    const target = next.page ?? page;
    if (unread) params.set("unread", "1");
    if (target > 1) params.set("page", String(target));
    const qs = params.toString();
    router.push(qs ? `/notifications?${qs}` : "/notifications");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={unreadOnly ? "outline" : "secondary"}
          size="sm"
          onClick={() => go({ unread: false, page: 1 })}
        >
          All
        </Button>
        <Button
          variant={unreadOnly ? "secondary" : "outline"}
          size="sm"
          onClick={() => go({ unread: true, page: 1 })}
        >
          Unread{unreadCount > 0 ? ` (${unreadCount})` : ""}
        </Button>

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => run(refreshMyNotifications)}
            disabled={pending}
            className="gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`} />
            Check now
          </Button>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => run(markAllNotificationsRead)}
              disabled={pending}
              className="gap-1.5"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </Button>
          )}
        </div>
      </div>

      {notifications.length === 0 ? (
        <EmptyState
          icon={Bell}
          title={unreadOnly ? "Nothing unread" : "No notifications yet"}
          description={
            unreadOnly
              ? "Everything here has been read."
              : "Budget, recurring and sync alerts will show up here."
          }
        />
      ) : (
        <div className="divide-y rounded-xl border">
          {notifications.map((n) => {
            const Icon = severityIcon[n.severity];
            return (
              <button
                key={n.id}
                // Same gesture as the bell: reading one marks it, nothing is
                // marked just by opening the page.
                onClick={() => !n.read && run(() => markNotificationRead(n.id))}
                disabled={pending || n.read}
                className={`flex w-full items-start gap-3 p-4 text-left transition-colors ${
                  n.read ? "" : "bg-accent/40 hover:bg-accent"
                } disabled:cursor-default`}
              >
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${severityColor[n.severity]}`} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-medium">{n.title}</span>
                    {!n.read && (
                      <span
                        className="size-2 shrink-0 rounded-full bg-brand"
                        aria-label="Unread"
                      />
                    )}
                  </span>
                  <span className="mt-1 block text-sm text-muted-foreground">{n.body}</span>
                  <span className="mt-1.5 block text-xs text-muted-foreground/70">
                    {relativeTime(n.createdAt)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {(page > 1 || hasMore > 0) && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => go({ page: page - 1 })}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">Page {page}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={hasMore <= 0}
            onClick={() => go({ page: page + 1 })}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
