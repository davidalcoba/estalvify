"use client";

import { useState, useTransition } from "react";
import { RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  const [isPending, startTransition] = useTransition();

  function handleReconnect() {
    setError(null);
    startTransition(async () => {
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
        disabled={isPending}
        className={secondary
          ? "gap-1.5 h-7 text-xs text-muted-foreground hover:text-foreground"
          : "gap-1.5 h-7 text-xs border border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-700"}
      >
        {isPending && <Loader2 className="h-3 w-3 animate-spin" />}
        {!isPending && !secondary && <RefreshCw className="h-3 w-3" />}
        {label}
      </Button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
