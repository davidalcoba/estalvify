"use client";

import { useState, useRef } from "react";
import { Pencil, Check, Loader2, X } from "lucide-react";
import { renameAccount } from "@/app/(app)/accounts/actions";
import { useAction } from "@/lib/use-action";

interface AccountNameEditorProps {
  accountId: string;
  initialName: string;
}

export function AccountNameEditor({ accountId, initialName }: AccountNameEditorProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialName);
  const [saved, setSaved] = useState(initialName);
  const { run, pending: isPending } = useAction();
  const inputRef = useRef<HTMLInputElement>(null);

  function startEditing() {
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function cancel() {
    setValue(saved);
    setEditing(false);
  }

  function save() {
    if (!value.trim() || value.trim() === saved) {
      cancel();
      return;
    }
    run("rename", async () => {
      await renameAccount(accountId, value.trim());
      setSaved(value.trim());
      setEditing(false);
    });
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") save();
    if (e.key === "Escape") cancel();
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={isPending}
          className="text-sm font-medium bg-background border border-input rounded px-1.5 py-0.5 w-32 focus:outline-none focus:ring-1 focus:ring-ring"
          autoFocus
        />
        <button
          onClick={save}
          disabled={isPending}
          aria-busy={isPending || undefined}
          aria-label="Save name"
          className="text-success hover:text-success/80 disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
        </button>
        <button onClick={cancel} disabled={isPending} className="text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <span className="text-sm font-medium">{saved}</span>
      <button
        onClick={startEditing}
        className="text-muted-foreground/50 hover:text-foreground transition-colors"
        title="Rename"
      >
        <Pencil className="h-3 w-3" />
      </button>
    </div>
  );
}
