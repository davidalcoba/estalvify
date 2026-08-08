"use client";

// Settings → "Privacy & data": the two GDPR self-service rights.
//
//  - Export: a full JSON download of everything the account owns (portability).
//    A plain link — the route streams the file with a download disposition.
//  - Delete: irreversible erasure. Gated behind a dialog that requires typing
//    DELETE, because this also revokes the bank consents and removes every
//    transaction — there is no undo and no soft state.

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { deleteMyAccount } from "@/app/(app)/settings/actions";
import { Download } from "lucide-react";
import { useT } from "@/components/i18n/i18n-provider";

const CONFIRM_WORD = "DELETE";

export function PrivacyDataCard({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const t = useT();

  const confirmed = confirmation.trim() === CONFIRM_WORD;

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      try {
        await deleteMyAccount();
        // On success the action signs out and redirects; nothing to do here.
      } catch (err) {
        // The signOut redirect surfaces as a NEXT_REDIRECT "error" — let the
        // framework handle that one; only real failures should show.
        if (err instanceof Error && err.message.includes("NEXT_REDIRECT")) {
          throw err;
        }
        setError(t("settings.privacy.delete.failed"));
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.privacy.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-1.5">
          <p className="text-sm font-medium">{t("settings.privacy.export.title")}</p>
          <p className="text-sm text-muted-foreground">
            {t("settings.privacy.export.body", { email })}
          </p>
          <Button asChild variant="outline" className="gap-2">
            <a href="/api/export">
              <Download className="size-4" aria-hidden />
              {t("settings.privacy.export.action")}
            </a>
          </Button>
        </div>

        <div className="space-y-1.5 border-t pt-5">
          <p className="text-sm font-medium text-destructive">
            {t("settings.privacy.delete.title")}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("settings.privacy.delete.body")}
          </p>
          <Dialog
            open={open}
            onOpenChange={(next) => {
              setOpen(next);
              if (!next) {
                setConfirmation("");
                setError(null);
              }
            }}
          >
            <DialogTrigger asChild>
              <Button variant="destructive">{t("settings.privacy.delete.action")}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("settings.privacy.delete.dialogTitle")}</DialogTitle>
                <DialogDescription>
                  {t("settings.privacy.delete.dialogBody", { email })}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-1.5">
                <Label htmlFor="delete-confirmation">
                  {t("settings.privacy.delete.confirmLabel", { word: CONFIRM_WORD })}
                </Label>
                <Input
                  id="delete-confirmation"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  autoComplete="off"
                  disabled={isPending}
                />
                {error && (
                  <p className="text-sm text-destructive" role="alert">
                    {error}
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={isPending}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={!confirmed || isPending}
                >
                  {isPending ? t("common.deleting") : t("settings.privacy.delete.confirmAction")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
}
