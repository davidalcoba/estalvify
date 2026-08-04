"use client";

import { useState, useRef, useTransition } from "react";
import { UserRound, Check, X } from "lucide-react";
import { setAccountOwner } from "@/app/(app)/accounts/actions";

interface AccountOwnerEditorProps {
  accountId: string;
  initialOwner: string | null;
}

// Inline holder editor, mirroring AccountNameEditor. Empty clears the holder.
export function AccountOwnerEditor({ accountId, initialOwner }: AccountOwnerEditorProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialOwner ?? "");
  const [saved, setSaved] = useState(initialOwner ?? "");
  const [isPending, startTransition] = useTransition();
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
    if (value.trim() === saved) {
      cancel();
      return;
    }
    startTransition(async () => {
      await setAccountOwner(accountId, value.trim());
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
          placeholder="Holder"
          className="text-xs bg-background border border-input rounded px-1.5 py-0.5 w-24 focus:outline-none focus:ring-1 focus:ring-ring"
          autoFocus
        />
        <button onClick={save} disabled={isPending} className="text-success hover:text-success/80">
          <Check className="h-3 w-3" />
        </button>
        <button onClick={cancel} disabled={isPending} className="text-muted-foreground hover:text-foreground">
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={startEditing}
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      title="Set account holder"
    >
      <UserRound className="h-3 w-3" />
      {saved || "Set holder"}
    </button>
  );
}
