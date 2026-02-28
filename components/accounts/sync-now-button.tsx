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
        // Start the sync — the API immediately sets status to SYNCING in DB.
        const syncPromise = fetch(`/api/banking/sync/${connectionId}`, { method: "POST" });

        // Refresh the page shortly after the request lands so the server-rendered
        // SYNCING badge appears and the SyncPoller activates to keep polling.
        setTimeout(() => router.refresh(), 400);

        await syncPromise;
      } catch {
        // non-fatal
      }
    }

    setSyncing(false);
    // Final refresh to show the ACTIVE status and updated balances.
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
