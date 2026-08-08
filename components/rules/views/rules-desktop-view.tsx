"use client";

import { useState } from "react";
import { Pencil, Play, Trash2, Undo2, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  type CategoryRuleDTO,
  FIELD_LABEL_KEYS,
  OPERATOR_LABEL_KEYS,
  formatConditionValue,
} from "@/lib/rules/rule-dto";
import { useRuleRowActions } from "@/components/rules/use-rule-row-actions";
import { useRuleOrder, type RuleOrderHandleProps } from "@/components/rules/use-rule-order";
import { RuleConfirmDialog } from "@/components/rules/rule-confirm-dialog";
import type { Category } from "@/components/categorize/category-options";
import { RuleEditDialog } from "@/components/rules/rule-edit-dialog";
import { useT } from "@/components/i18n/i18n-provider";

interface RulesDesktopViewProps {
  rules: CategoryRuleDTO[];
  categories: Category[];
}

export function RulesDesktopView({ rules, categories }: RulesDesktopViewProps) {
  const t = useT();
  const { orderedRules, containerRef, handleProps, draggingId, error } =
    useRuleOrder(rules);

  if (rules.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">{t("rules.empty")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="px-2 py-2.5 w-8">
                <span className="sr-only">{t("rules.table.order")}</span>
              </th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-20">
                {t("rules.table.active")}
              </th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                {t("rules.table.name")}
              </th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden lg:table-cell">
                {t("rules.table.conditions")}
              </th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                {t("rules.table.target")}
              </th>
              <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">
                {t("rules.table.actions")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y" ref={containerRef}>
            {orderedRules.map((rule) => (
              <RulesDesktopRow
                key={rule.id}
                rule={rule}
                categories={categories}
                handleProps={handleProps(rule.id)}
                isDragging={draggingId === rule.id}
              />
            ))}
          </tbody>
        </table>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function RulesDesktopRow({
  rule,
  categories,
  handleProps,
  isDragging,
}: {
  rule: CategoryRuleDTO;
  categories: Category[];
  handleProps: RuleOrderHandleProps;
  isDragging: boolean;
}) {
  const {
    isPending,
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
  } = useRuleRowActions(rule);
  const t = useT();
  const [editing, setEditing] = useState(false);

  return (
    <>
    {editing && (
      <RuleEditDialog rule={rule} categories={categories} onClose={() => setEditing(false)} />
    )}
    <RuleConfirmDialog
      open={confirmingRevert}
      title={t("rules.revert.title", { name: rule.name })}
      description={<p>{t("rules.revert.body")}</p>}
      confirmLabel={t("rules.revert")}
      pendingLabel={t("rules.reverting")}
      isPending={isPending}
      onCancel={cancelRevert}
      onConfirm={handleRevert}
    />
    <RuleConfirmDialog
      open={confirmingDelete}
      title={t("rules.delete.title", { name: rule.name })}
      description={
        <>
          <p>{t("rules.delete.body1")}</p>
          <p>{t("rules.delete.body2")}</p>
        </>
      }
      confirmLabel={t("rules.delete")}
      pendingLabel={t("common.deleting")}
      isPending={isPending}
      onCancel={cancelDelete}
      onConfirm={handleDelete}
    />
    <tr
      data-reorder-id={rule.id}
      className={`transition-colors ${isDragging ? "bg-muted/60" : "hover:bg-muted/20"} ${!rule.isActive ? "opacity-60" : ""}`}
    >
      {/* Drag handle — position in this list is the evaluation order */}
      <td className="px-2 py-3">
        <span
          {...handleProps}
          className="flex h-8 w-6 select-none items-center justify-center rounded text-muted-foreground/60 hover:text-foreground cursor-grab active:cursor-grabbing touch-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <GripVertical className="h-4 w-4" />
        </span>
      </td>

      {/* Active: enable / disable the rule. Nothing to do with "run now" — a
          disabled rule is skipped by every run, including the post-sync one. */}
      <td className="px-4 py-3">
        <Switch
          checked={rule.isActive}
          onCheckedChange={handleToggleActive}
          disabled={isPending}
          aria-label={rule.isActive ? t("rules.toggle.disable") : t("rules.toggle.enable")}
          title={
            rule.isActive ? t("rules.toggle.disableHelp") : t("rules.toggle.enable")
          }
        />
      </td>

      {/* Name */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-medium">{rule.name}</span>
          {!rule.isActive && (
            <Badge variant="secondary" className="text-xs">{t("rules.disabled")}</Badge>
          )}
          {rule.neverMatched && (
            <Badge variant="outline" className="text-xs text-warning border-warning">
              {t("rules.neverMatched")}
            </Badge>
          )}
        </div>
        {rule.lastRunAt && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("rules.matchedCount", { count: rule.matchCount })}
          </p>
        )}
        {result && (
          <p className="text-xs text-success font-medium mt-0.5">{result}</p>
        )}
      </td>

      {/* Conditions summary */}
      <td className="px-4 py-3 hidden lg:table-cell">
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-xs font-medium text-muted-foreground">
            {rule.match === "OR" ? t("rules.match.any") : t("rules.match.all")}
          </span>
          {rule.conditions.slice(0, 2).map((c, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted rounded px-2 py-0.5"
            >
              <span className="font-medium">{t(FIELD_LABEL_KEYS[c.field])}</span>
              <span>
                {c.negate ? t("rules.negatePrefix") : ""}
                {t(OPERATOR_LABEL_KEYS[c.operator])}
              </span>
              <span className="font-medium truncate max-w-[80px]">
                &quot;{formatConditionValue(c)}&quot;
              </span>
            </span>
          ))}
          {rule.conditions.length > 2 && (
            <span className="text-xs text-muted-foreground">
              {t("rules.more", { count: rule.conditions.length - 2 })}
            </span>
          )}
        </div>
      </td>

      {/* Target category */}
      <td className="px-4 py-3">
        <div className="space-y-0.5">
          {rule.sourceCategoryName && (
            <p className="text-xs text-muted-foreground">
              {t("rules.from")}{" "}
              <span style={{ color: rule.sourceCategoryColor ?? undefined }}>
                {rule.sourceCategoryName}
              </span>
            </p>
          )}
          <p
            className="text-xs font-medium"
            style={{ color: rule.categoryColor }}
          >
            {rule.categoryName}
          </p>
        </div>
      </td>

      {/* Actions */}
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setEditing(true)}
            disabled={isPending}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            aria-label={t("rules.edit")}
            title={t("rules.edit")}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleExecute}
            disabled={isPending || !rule.isActive}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            aria-label={t("rules.run")}
            title={rule.isActive ? t("rules.run") : t("rules.run.disabled")}
          >
            <Play className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={requestRevert}
            disabled={isPending}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            aria-label={t("rules.revert")}
            title={t("rules.revert")}
          >
            <Undo2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={requestDelete}
            disabled={isPending}
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            aria-label={t("rules.delete")}
            title={t("rules.delete")}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </td>
    </tr>
    </>
  );
}
