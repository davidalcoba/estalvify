"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAction } from "@/lib/use-action";

interface SyncNowButtonProps {
  connectionIds: string[];
  disabled?: boolean; // externally disabled (e.g. server-side status is SYNCING)
}

export function SyncNowButton({ connectionIds, disabled = false }: SyncNowButtonProps) {
  const { run, pending: syncing } = useAction();
  const router = useRouter();

  function handleSync() {
    if (syncing || disabled) return;

    run("sync", async () => {
      for (const connectionId of connectionIds) {
        try {
          // The route sets status=SYNCING in DB and enqueues the job, then
          // returns immediately. A single refresh is enough to show the badge.
          await fetch(`/api/banking/sync/${connectionId}`, { method: "POST" });
        } catch {
          // non-fatal
        }
      }

      // Refresh once — the SYNCING badge is now in DB, SyncPoller takes over.
      router.refresh();
    });
  }

  const isDisabled = disabled || syncing;

  return (
    <button
      onClick={handleSync}
      disabled={isDisabled}
      aria-busy={syncing || undefined}
      title={disabled ? "Sync in progress" : "Sync now"}
      className="text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
    >
      <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
    </button>
  );
}
