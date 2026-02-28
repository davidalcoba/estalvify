"use client";

import { useState, useRef, useTransition } from "react";
import { Pencil, Check, X } from "lucide-react";
import { renameAccount } from "@/app/(app)/accounts/actions";

interface AccountNameEditorProps {
  accountId: string;
  initialName: string;
}

export function AccountNameEditor({ accountId, initialName }: AccountNameEditorProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialName);
  const [saved, setSaved] = useState(initialName);
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
    if (!value.trim() || value.trim() === saved) {
      cancel();
      return;
    }
    startTransition(async () => {
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
          className="text-sm font-medium bg-white border border-input rounded px-1.5 py-0.5 w-32 focus:outline-none focus:ring-1 focus:ring-ring"
          autoFocus
        />
        <button onClick={save} disabled={isPending} className="text-green-600 hover:text-green-700">
          <Check className="h-3.5 w-3.5" />
        </button>
        <button onClick={cancel} disabled={isPending} className="text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 group">
      <span className="text-sm font-medium">{saved}</span>
      <button
        onClick={startEditing}
        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
      >
        <Pencil className="h-3 w-3" />
      </button>
    </div>
  );
}
