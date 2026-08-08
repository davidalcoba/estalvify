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
import { useCanWrite } from "@/components/layout/role-provider";
import { useT } from "@/components/i18n/i18n-provider";
import { RichText } from "@/components/i18n/rich-text";

interface DeleteAccountButtonProps {
  accountId: string;
  accountName: string;
}

export function DeleteAccountButton({ accountId, accountName }: DeleteAccountButtonProps) {
  const hydrated = useHydrated();
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [isPending, startTransition] = useTransition();
  const canWrite = useCanWrite();
  const t = useT();

  if (!canWrite) return null;

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
        title={t("accounts.delete.tooltip")}
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
        <button
          className="text-muted-foreground/50 hover:text-destructive transition-colors"
          title={t("accounts.delete.tooltip")}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("accounts.delete.title", { name: accountName })}</DialogTitle>
          <DialogDescription>{t("accounts.delete.body")}</DialogDescription>
        </DialogHeader>
        <div className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
          <Checkbox
            id="delete-account-confirm"
            checked={confirmed}
            onCheckedChange={(v) => setConfirmed(!!v)}
            className="mt-0.5"
          />
          <label htmlFor="delete-account-confirm" className="text-sm leading-snug cursor-pointer select-none">
            <RichText
              template={t("accounts.delete.confirm")}
              slots={{ name: <strong>{accountName}</strong> }}
            />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isPending}>
            {t("common.cancel")}
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={isPending || !confirmed}>
            {isPending ? t("common.deleting") : t("accounts.delete.tooltip")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
