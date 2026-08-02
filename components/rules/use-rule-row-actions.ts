"use client";

import { useState } from "react";
import {
  executeRule,
  deleteRule,
  revertRule,
  toggleRuleActive,
} from "@/app/(app)/rules/actions";
import { useAction } from "@/lib/use-action";
import type { CategoryRuleDTO } from "@/lib/rules/rule-dto";

// Shared run/revert/delete/toggle logic for a saved-rule row, used by both the
// desktop and mobile rule views (previously copy-pasted in each).
export function useRuleRowActions(rule: CategoryRuleDTO) {
  const { run, pending: isPending, busy } = useAction();
  const [result, setResult] = useState<string | null>(null);
  // Both actions are hard to take back, so the row asks before acting.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingRevert, setConfirmingRevert] = useState(false);

  function handleExecute() {
    setResult(null);
    run("execute", async () => {
      const { categorized } = await executeRule(rule.id);
      setResult(categorized > 0 ? `${categorized} categorized` : "No matches");
    });
  }

  function requestRevert() {
    setConfirmingRevert(true);
  }

  function cancelRevert() {
    setConfirmingRevert(false);
  }

  function handleRevert() {
    setResult(null);
    run("revert", async () => {
      const { reverted } = await revertRule(rule.id);
      setResult(reverted > 0 ? `${reverted} reverted` : "Nothing to revert");
      setConfirmingRevert(false);
    });
  }

  function requestDelete() {
    setConfirmingDelete(true);
  }

  function cancelDelete() {
    setConfirmingDelete(false);
  }

  function handleDelete() {
    run("delete", async () => {
      await deleteRule(rule.id);
      setConfirmingDelete(false);
    });
  }

  function handleToggleActive() {
    run("toggle", async () => {
      await toggleRuleActive(rule.id, !rule.isActive);
    });
  }

  return {
    isPending,
    /** Which of this row's actions is currently writing. */
    busy,
    result,
    confirmingRevert,
    confirmingDelete,
    handleExecute,
    requestRevert,
    cancelRevert,
    handleRevert,
    requestDelete,
    cancelDelete,
    handleDelete,
    handleToggleActive,
  };
}
