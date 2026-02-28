"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";

interface SyncNowButtonProps {
  connectionIds: string[];
  disabled?: boolean; // externally disabled (e.g. server-side status is SYNCING)
}

export function SyncNowButton({ connectionIds, disabled = false }: SyncNowButtonProps) {
  const [syncing, setSyncing] = useState(false);
  const router = useRouter();

  async function handleSync() {
    if (syncing || disabled) return;
    setSyncing(true);

    for (const connectionId of connectionIds) {
      try {
        // The route sets status=SYNCING in DB and enqueues the job, then
        // returns immediately. A single refresh is enough to show the badge.
        await fetch(`/api/banking/sync/${connectionId}`, { method: "POST" });
      } catch {
        // non-fatal
      }
    }

    setSyncing(false);
    // Refresh once — the SYNCING badge is now in DB, SyncPoller takes over.
    router.refresh();
  }

  const isDisabled = disabled || syncing;

  return (
    <button
      onClick={handleSync}
      disabled={isDisabled}
      title={disabled ? "Sync in progress" : "Sync now"}
      className="text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
    >
      <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
    </button>
  );
}
