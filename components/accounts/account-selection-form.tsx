"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { finalizeSetup, cancelSetup } from "@/app/(app)/accounts/setup/actions";
import { Building2 } from "lucide-react";

interface AccountOption {
  uid: string;
  name: string;
  iban?: string;
  currency: string;
}

export function AccountSelectionForm({
  connectionId,
  accounts,
}: {
  connectionId: string;
  accounts: AccountOption[];
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(accounts.map((a) => a.uid))
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle(uid: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  function handleImport() {
    if (selected.size === 0) {
      setError("Select at least one account to import.");
      return;
    }
    setError(null);
    startTransition(() => finalizeSetup(connectionId, Array.from(selected)));
  }

  function handleCancel() {
    startTransition(() => cancelSetup(connectionId));
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {accounts.map((account) => {
          const isSelected = selected.has(account.uid);
          return (
            <button
              key={account.uid}
              type="button"
              onClick={() => toggle(account.uid)}
              disabled={isPending}
              className={`w-full text-left rounded-lg border px-4 py-3 transition-colors flex items-center gap-3 ${
                isSelected
                  ? "border-indigo-500 bg-indigo-50"
                  : "border-border bg-background hover:bg-muted/50"
              }`}
            >
              {/* Checkbox indicator */}
              <span
                className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${
                  isSelected ? "bg-indigo-600 border-indigo-600" : "border-input"
                }`}
              >
                {isSelected && (
                  <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>

              {/* Account icon */}
              <div className="w-8 h-8 rounded-md bg-slate-100 flex items-center justify-center shrink-0">
                <Building2 className="h-4 w-4 text-slate-500" />
              </div>

              {/* Account info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{account.name}</p>
                {account.iban && (
                  <p className="text-xs text-muted-foreground font-mono">
                    {account.iban.replace(/(.{4})/g, "$1 ").trim()}
                  </p>
                )}
              </div>

              <span className="text-xs text-muted-foreground shrink-0">{account.currency}</span>
            </button>
          );
        })}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center gap-3 pt-2">
        <Button onClick={handleImport} disabled={isPending || selected.size === 0}>
          {isPending ? "Importing…" : `Import ${selected.size} account${selected.size !== 1 ? "s" : ""}`}
        </Button>
        <Button variant="ghost" onClick={handleCancel} disabled={isPending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
