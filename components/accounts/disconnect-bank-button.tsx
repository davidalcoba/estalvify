"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { disconnectBankGroup } from "@/app/(app)/accounts/actions";
import { useHydrated } from "@/lib/use-hydrated";

interface DisconnectBankButtonProps {
  connectionIds: string[];
  bankName: string;
}

export function DisconnectBankButton({ connectionIds, bankName }: DisconnectBankButtonProps) {
  const hydrated = useHydrated();
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setConfirmed(false);
  }

  function handleDisconnect() {
    startTransition(async () => {
      await disconnectBankGroup(connectionIds);
      setOpen(false);
    });
  }

  if (!hydrated) {
    return (
      <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" disabled>
        <Trash2 className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
          <Trash2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Disconnect {bankName}?</DialogTitle>
          <DialogDescription>
            This will permanently remove the bank connection, all linked accounts, and{" "}
            <strong>all their transactions</strong> from Estalvify. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
          <Checkbox
            id="disconnect-confirm"
            checked={confirmed}
            onCheckedChange={(v) => setConfirmed(!!v)}
            className="mt-0.5"
          />
          <label htmlFor="disconnect-confirm" className="text-sm leading-snug cursor-pointer select-none">
            I understand that all accounts and transactions for <strong>{bankName}</strong> will be permanently deleted.
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDisconnect} disabled={isPending || !confirmed}>
            {isPending ? "Disconnecting…" : "Disconnect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
