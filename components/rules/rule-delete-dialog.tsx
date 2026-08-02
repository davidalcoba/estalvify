"use client";

import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CategoryRuleDTO } from "@/lib/rules/rule-dto";

interface RuleDeleteDialogProps {
  rule: CategoryRuleDTO;
  open: boolean;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Confirmation for rule deletion, shared by the desktop and mobile rule views. */
export function RuleDeleteDialog({
  rule,
  open,
  isPending,
  onCancel,
  onConfirm,
}: RuleDeleteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TriangleAlert className="h-5 w-5 text-destructive flex-shrink-0" />
            Delete &ldquo;{rule.name}&rdquo;?
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 pt-1">
              <p>
                Transactions it categorized keep their category, but lose the link
                to this rule — so they can no longer be reverted.
              </p>
              <p>
                To stop the rule without losing it, deactivate it instead.
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
            {isPending ? "Deleting…" : "Delete rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
