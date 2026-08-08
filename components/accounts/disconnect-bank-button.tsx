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
import { useCanWrite } from "@/components/layout/role-provider";
import { useT } from "@/components/i18n/i18n-provider";
import { RichText } from "@/components/i18n/rich-text";

interface DisconnectBankButtonProps {
  connectionIds: string[];
  bankName: string;
}

export function DisconnectBankButton({ connectionIds, bankName }: DisconnectBankButtonProps) {
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
          <DialogTitle>{t("accounts.disconnect.title", { name: bankName })}</DialogTitle>
          <DialogDescription>{t("accounts.disconnect.body")}</DialogDescription>
        </DialogHeader>
        <div className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
          <Checkbox
            id="disconnect-confirm"
            checked={confirmed}
            onCheckedChange={(v) => setConfirmed(!!v)}
            className="mt-0.5"
          />
          <label htmlFor="disconnect-confirm" className="text-sm leading-snug cursor-pointer select-none">
            <RichText
              template={t("accounts.disconnect.confirm")}
              slots={{ name: <strong>{bankName}</strong> }}
            />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isPending}>
            {t("common.cancel")}
          </Button>
          <Button variant="destructive" onClick={handleDisconnect} disabled={isPending || !confirmed}>
            {isPending
              ? t("accounts.disconnect.pending")
              : t("accounts.disconnect.action")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
