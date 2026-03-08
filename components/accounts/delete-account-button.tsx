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
import { deleteAccount } from "@/app/(app)/accounts/actions";
import { useHydrated } from "@/lib/use-hydrated";

interface DeleteAccountButtonProps {
  accountId: string;
  accountName: string;
}

export function DeleteAccountButton({ accountId, accountName }: DeleteAccountButtonProps) {
  const hydrated = useHydrated();
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setConfirmed(false);
  }

  function handleDelete() {
    startTransition(async () => {
      await deleteAccount(accountId);
      setOpen(false);
    });
  }

  if (!hydrated) {
    return (
      <button
        className="text-muted-foreground/50 hover:text-destructive transition-colors"
        title="Delete account"
        type="button"
        disabled
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button className="text-muted-foreground/50 hover:text-destructive transition-colors" title="Delete account">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {accountName}?</DialogTitle>
          <DialogDescription>
            This removes the account and all its transactions from Estalvify. This action cannot be undone.
            The account remains open at your bank — this only affects Estalvify.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
          <Checkbox
            id="delete-account-confirm"
            checked={confirmed}
            onCheckedChange={(v) => setConfirmed(!!v)}
            className="mt-0.5"
          />
          <label htmlFor="delete-account-confirm" className="text-sm leading-snug cursor-pointer select-none">
            I understand that all transactions for <strong>{accountName}</strong> will be permanently deleted.
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={isPending || !confirmed}>
            {isPending ? "Deleting…" : "Delete account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
