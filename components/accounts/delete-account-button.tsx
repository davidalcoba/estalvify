"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  const [isPending, startTransition] = useTransition();

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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="text-muted-foreground/50 hover:text-destructive transition-colors" title="Delete account">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete account {accountName}?</DialogTitle>
          <DialogDescription>
            This removes the account and all its transactions from Estalvify.
            The account remains open at your bank — this only affects Estalvify.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
            {isPending ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
