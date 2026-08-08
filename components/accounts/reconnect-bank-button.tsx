"use client";

import { useState, useTransition } from "react";
import { RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCanWrite } from "@/components/layout/role-provider";
import { useT } from "@/components/i18n/i18n-provider";

interface ReconnectBankButtonProps {
  connectionId: string;
  aspspName: string;
  aspspCountry: string;
  label?: string;
  /** Render as a subtle ghost link instead of an outlined button */
  secondary?: boolean;
}

export function ReconnectBankButton({ connectionId, aspspName, aspspCountry, label, secondary = false }: ReconnectBankButtonProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const canWrite = useCanWrite();
  const t = useT();

  if (!canWrite) return null;

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
          setError(data.error ?? t("accounts.reconnect.failed"));
          return;
        }

        window.location.href = data.url;
      } catch {
        setError(t("accounts.network"));
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
          : "gap-1.5 h-7 text-xs border border-warning/40 text-warning hover:bg-warning/10 hover:text-warning"}
      >
        {isPending && <Loader2 className="h-3 w-3 animate-spin" />}
        {!isPending && !secondary && <RefreshCw className="h-3 w-3" />}
        {label ?? t("accounts.reconnect")}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
