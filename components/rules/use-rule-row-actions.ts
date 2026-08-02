"use client";

import { useState, useTransition } from "react";
import { executeRule, deleteRule, toggleRuleActive } from "@/app/(app)/rules/actions";
import type { CategoryRuleDTO } from "@/lib/rules/rule-dto";

// Shared run/delete/toggle logic for a saved-rule row, used by both the desktop
// and mobile rule views (previously copy-pasted in each).
export function useRuleRowActions(rule: CategoryRuleDTO) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  // Deletion is irreversible, so the row asks before acting.
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function handleExecute() {
    setResult(null);
    startTransition(async () => {
      const { categorized } = await executeRule(rule.id);
      setResult(categorized > 0 ? `${categorized} categorized` : "No matches");
    });
  }

  function requestDelete() {
    setConfirmingDelete(true);
  }

  function cancelDelete() {
    setConfirmingDelete(false);
  }

  function handleDelete() {
    startTransition(async () => {
      await deleteRule(rule.id);
      setConfirmingDelete(false);
    });
  }

  function handleToggleActive() {
    startTransition(async () => {
      await toggleRuleActive(rule.id, !rule.isActive);
    });
  }

  return {
    isPending,
    result,
    confirmingDelete,
    handleExecute,
    requestDelete,
    cancelDelete,
    handleDelete,
    handleToggleActive,
  };
}
