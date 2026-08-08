"use client";

import { useState, useTransition } from "react";
import { Plus, Search, Play, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CategorySelect } from "@/components/categorize/category-select";
import type { Category } from "@/components/categorize/category-options";
import { RuleConditionRow } from "@/components/rules/rule-condition-row";
import { RuleMatchSelect } from "@/components/rules/rule-match-select";
import { RulePreviewList } from "@/components/rules/rule-preview-list";
import {
  type ConditionGroupOp,
  type RuleCondition,
  getDefaultOperator,
  getDefaultValue,
  hasConditionValue,
} from "@/lib/rules/rule-dto";
import {
  previewRuleTransactions,
  executeRuleOnce,
} from "@/app/(app)/rules/actions";
import type { TransactionListItemDTO } from "@/lib/transactions/transaction-dto";
import { useT } from "@/components/i18n/i18n-provider";

const PREVIEW_LIMIT = 50;

function defaultCondition(): RuleCondition {
  return {
    field: "any",
    operator: getDefaultOperator("any"),
    value: getDefaultValue("any"),
  };
}

interface RuleBuilderFormProps {
  categories: Category[];
  locale: string;
}

export function RuleBuilderForm({ categories, locale }: RuleBuilderFormProps) {
  const t = useT();
  const [conditions, setConditions] = useState<RuleCondition[]>([defaultCondition()]);
  const [match, setMatch] = useState<ConditionGroupOp>("AND");
  const [targetCategoryId, setTargetCategoryId] = useState<string>("");
  const [ruleName, setRuleName] = useState<string>("");

  const [preview, setPreview] = useState<{
    transactions: TransactionListItemDTO[];
    total: number;
  } | null>(null);

  const [executeResult, setExecuteResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [isSearching, startSearch] = useTransition();
  const [isExecuting, startExecute] = useTransition();

  function handleConditionChange(index: number, condition: RuleCondition) {
    setConditions((prev: RuleCondition[]) => prev.map((c: RuleCondition, i: number) => (i === index ? condition : c)));
    setPreview(null);
    setExecuteResult(null);
  }

  function handleConditionRemove(index: number) {
    setConditions((prev: RuleCondition[]) => prev.filter((_: RuleCondition, i: number) => i !== index));
    setPreview(null);
    setExecuteResult(null);
  }

  function handleAddCondition() {
    setConditions((prev: RuleCondition[]) => [...prev, defaultCondition()]);
  }

  const filled = conditions.filter(hasConditionValue);
  const hasValidConditions = filled.length > 0;
  const conditionTree = { op: match, children: filled };

  function handleSearch() {
    setError(null);
    setExecuteResult(null);
    startSearch(async () => {
      try {
        const result = await previewRuleTransactions(conditionTree, null);
        setPreview(result);
      } catch {
        setError(t("rules.searchFailed"));
      }
    });
  }

  function handleExecute() {
    if (!targetCategoryId) {
      setError(t("rules.needCategory"));
      return;
    }
    setError(null);
    setExecuteResult(null);
    startExecute(async () => {
      try {
        const result = await executeRuleOnce({
          conditions: conditionTree,
          sourceCategoryId: null,
          categoryId: targetCategoryId,
          ruleName: ruleName.trim() || null,
        });
        const msg =
          result.categorized === 0
            ? t("rules.result.none")
            : t.plural(
                result.savedRuleId ? "rules.result.countSaved" : "rules.result.count",
                result.categorized,
              );
        setExecuteResult(msg);
        if (result.categorized > 0) {
          const updated = await previewRuleTransactions(conditionTree, null);
          setPreview(updated);
        }
      } catch {
        setError(t("rules.executeFailed"));
      }
    });
  }

  const isPending = isSearching || isExecuting;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-4 md:p-6 space-y-5">
          {/* Rule name */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              {t("rules.name")}{" "}
              <span className="text-muted-foreground font-normal">
                {t("rules.name.optional")}
              </span>
            </label>
            <input
              type="text"
              value={ruleName}
              onChange={(e) => setRuleName(e.target.value)}
              placeholder={t("rules.name.placeholder")}
              className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            />
          </div>

          {/* Conditions + target category in one visual block */}
          <div className="space-y-2">
            <RuleMatchSelect
              value={match}
              onValueChange={(op) => {
                setMatch(op);
                setPreview(null);
                setExecuteResult(null);
              }}
            />

            <div className="space-y-2">
              {conditions.map((condition: RuleCondition, index: number) => (
                <RuleConditionRow
                  key={index}
                  condition={condition}
                  index={index}
                  onChange={handleConditionChange}
                  onRemove={handleConditionRemove}
                  canRemove={conditions.length > 1}
                />
              ))}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddCondition}
              className="gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("rules.addCondition")}
            </Button>

            {/* Target category — inline with conditions block */}
            <div className="flex items-center gap-3 pt-1 flex-wrap sm:flex-nowrap">
              <span className="text-sm text-muted-foreground shrink-0">
                {t("rules.categorizeAs")}
              </span>
              <CategorySelect
                value={targetCategoryId}
                onValueChange={setTargetCategoryId}
                categories={categories}
                placeholder={t("rules.selectCategory")}
                ariaLabel={t("rules.categorizeAsLabel")}
                className="flex-1 min-w-[200px]"
              />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {executeResult && (
            <p className="text-sm text-success font-medium">{executeResult}</p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={handleSearch}
              disabled={isPending || !hasValidConditions}
              className="gap-2"
            >
              {isSearching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              {t("rules.search")}
            </Button>

            <Button
              type="button"
              onClick={handleExecute}
              disabled={isPending || !hasValidConditions || !targetCategoryId}
              className="gap-2"
            >
              {isExecuting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {t("rules.execute")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Preview */}
      {isSearching && (
        <div className="rounded-xl border p-6 text-center">
          <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground mt-2">{t("rules.searching")}</p>
        </div>
      )}

      {!isSearching && preview !== null && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">{t("rules.matching")}</h3>
          <RulePreviewList
            transactions={preview.transactions}
            total={preview.total}
            locale={locale}
            previewLimit={PREVIEW_LIMIT}
          />
        </div>
      )}
    </div>
  );
}
