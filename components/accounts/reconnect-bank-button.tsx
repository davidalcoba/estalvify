"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAction } from "@/lib/use-action";

interface ReconnectBankButtonProps {
  connectionId: string;
  aspspName: string;
  aspspCountry: string;
  label?: string;
  /** Render as a subtle ghost link instead of an outlined button */
  secondary?: boolean;
}

export function ReconnectBankButton({ connectionId, aspspName, aspspCountry, label = "Reconnect", secondary = false }: ReconnectBankButtonProps) {
  const [error, setError] = useState<string | null>(null);
  const { run, pending: isPending } = useAction();

  function handleReconnect() {
    setError(null);
    run("reconnect", async () => {
      try {
        const response = await fetch("/api/banking/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ aspspName, aspspCountry, reconnectConnectionId: connectionId }),
        });

        const data = await response.json();

        if (!response.ok) {
          setError(data.error ?? "Failed to reconnect");
          return;
        }

        window.location.href = data.url;
      } catch {
        setError("Network error. Please try again.");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleReconnect}
        loading={isPending}
        className={secondary
          ? "gap-1.5 h-7 text-xs text-muted-foreground hover:text-foreground"
          : "gap-1.5 h-7 text-xs border border-warning/40 text-warning hover:bg-warning/10 hover:text-warning"}
      >
        {!secondary && <RefreshCw className="h-3 w-3" />}
        {label}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
