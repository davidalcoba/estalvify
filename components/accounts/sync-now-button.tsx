"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";

interface SyncNowButtonProps {
  connectionId: string;
}

export function SyncNowButton({ connectionId }: SyncNowButtonProps) {
  const [status, setStatus] = useState<"idle" | "syncing" | "done" | "error">("idle");
  const [result, setResult] = useState<string | null>(null);
  const router = useRouter();

  async function handleSync() {
    setStatus("syncing");
    setResult(null);

    try {
      const res = await fetch(`/api/banking/sync/${connectionId}`, { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setResult(data.error ?? "Sync failed");
        return;
      }

      setStatus("done");
      setResult(`${data.transactionsFetched} transactions synced`);
      router.refresh();
    } catch {
      setStatus("error");
      setResult("Network error");
    }
  }

  return (
    <div className="flex items-center gap-2">
      {result && (
        <span className={`text-xs ${status === "error" ? "text-destructive" : "text-muted-foreground"}`}>
          {result}
        </span>
      )}
      <button
        onClick={handleSync}
        disabled={status === "syncing"}
        title="Sync now"
        className="text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
      >
        <RefreshCw className={`h-4 w-4 ${status === "syncing" ? "animate-spin" : ""}`} />
      </button>
    </div>
  );
}
