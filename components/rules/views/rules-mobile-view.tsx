"use client";

import { useState } from "react";
import {
  Pencil,
  Play,
  Trash2,
  Undo2,
  GripVertical,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
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

interface RulesMobileViewProps {
  rules: CategoryRuleDTO[];
  categories: Category[];
}

export function RulesMobileView({ rules, categories }: RulesMobileViewProps) {
  const t = useT();
  const { orderedRules, containerRef, handleProps, moveBy, draggingId, error } =
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
      <div className="space-y-3" ref={containerRef}>
        {orderedRules.map((rule, index) => (
          <RulesMobileCard
            key={rule.id}
            rule={rule}
            categories={categories}
            handleProps={handleProps(rule.id)}
            isDragging={draggingId === rule.id}
            onMoveUp={index === 0 ? null : () => moveBy(rule.id, -1)}
            onMoveDown={
              index === orderedRules.length - 1 ? null : () => moveBy(rule.id, 1)
            }
          />
        ))}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function RulesMobileCard({
  rule,
  categories,
  handleProps,
  isDragging,
  onMoveUp,
  onMoveDown,
}: {
  rule: CategoryRuleDTO;
  categories: Category[];
  handleProps: RuleOrderHandleProps;
  isDragging: boolean;
  /** Null at the ends of the list. */
  onMoveUp: (() => void) | null;
  onMoveDown: (() => void) | null;
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
    <Card
      data-reorder-id={rule.id}
      className={`py-0 gap-0 ${isDragging ? "bg-muted/60 shadow-md" : ""} ${!rule.isActive ? "opacity-60" : ""}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-2">
          {/* Order column. The buttons are the primary control here: a phone card
              is ~90px tall, so a drag has to travel about that far before the
              list reacts, and the handle is a small target next to it. Dragging
              still works for anyone who reaches for it. */}
          <div className="-ml-1.5 flex shrink-0 flex-col items-center">
            <button
              type="button"
              onClick={onMoveUp ?? undefined}
              disabled={!onMoveUp || isPending}
              className="flex h-9 w-9 items-center justify-center rounded text-muted-foreground disabled:opacity-30"
              aria-label={t("rules.moveUp")}
              title={t("rules.moveUp.help")}
            >
              <ChevronUp className="h-5 w-5" />
            </button>
            <span
              {...handleProps}
              className="flex h-11 w-9 select-none items-center justify-center rounded text-muted-foreground/70 cursor-grab active:cursor-grabbing touch-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <GripVertical className="h-4 w-4" />
            </span>
            <button
              type="button"
              onClick={onMoveDown ?? undefined}
              disabled={!onMoveDown || isPending}
              className="flex h-9 w-9 items-center justify-center rounded text-muted-foreground disabled:opacity-30"
              aria-label={t("rules.moveDown")}
              title={t("rules.moveDown.help")}
            >
              <ChevronDown className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">{rule.name}</span>
              {rule.neverMatched && (
                <Badge variant="outline" className="text-xs text-warning border-warning">
                  {t("rules.neverMatched")}
                </Badge>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
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

            <div className="text-xs text-muted-foreground">
              {rule.sourceCategoryName && (
                <span>
                  {t("rules.from")}{" "}
                  <span style={{ color: rule.sourceCategoryColor ?? undefined }}>
                    {rule.sourceCategoryName}
                  </span>
                  {" → "}
                </span>
              )}
              <span>
                {t("rules.to")}{" "}
                <span className="font-medium" style={{ color: rule.categoryColor }}>
                  {rule.categoryName}
                </span>
              </span>
            </div>

            {result && (
              <p className="text-xs text-success font-medium">{result}</p>
            )}

            {/* Enable / disable, spelled out — a separate thing from running the
                rule now (the ▷ action above). */}
            <div className="flex items-center gap-2 pt-0.5">
              <Switch
                id={`rule-active-${rule.id}`}
                checked={rule.isActive}
                onCheckedChange={handleToggleActive}
                disabled={isPending}
              />
              <label
                htmlFor={`rule-active-${rule.id}`}
                className="text-xs text-muted-foreground"
              >
                {rule.isActive ? t("rules.table.active") : t("rules.disabled")}
              </label>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setEditing(true)}
              disabled={isPending}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              aria-label={t("common.edit")}
              title={t("rules.edit")}
            >
              <Pencil className="h-4 w-4" />
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
              <Play className="h-4 w-4" />
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
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={requestDelete}
              disabled={isPending}
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              aria-label={t("common.delete")}
              title={t("rules.delete")}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
    </>
  );
}
