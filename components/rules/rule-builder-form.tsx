"use client";

import { useState, useTransition } from "react";
import { Plus, Search, Play, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CategoryOptions } from "@/components/categorize/category-options";
import type { Category } from "@/components/categorize/category-options";
import { RuleConditionRow } from "@/components/rules/rule-condition-row";
import { RulePreviewList } from "@/components/rules/rule-preview-list";
import {
  type RuleCondition,
  getDefaultOperator,
} from "@/lib/rules/rule-dto";
import {
  previewRuleTransactions,
  executeRuleOnce,
} from "@/app/(app)/rules/actions";
import type { TransactionListItemDTO } from "@/lib/transactions/transaction-dto";

const PREVIEW_LIMIT = 50;

function defaultCondition(): RuleCondition {
  return { field: "description", operator: "contains", value: "" };
}

interface RuleBuilderFormProps {
  categories: Category[];
  locale: string;
}

export function RuleBuilderForm({ categories, locale }: RuleBuilderFormProps) {
  const [conditions, setConditions] = useState<RuleCondition[]>([
    defaultCondition(),
  ]);
  const [sourceCategoryId, setSourceCategoryId] = useState<string>("");
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
    setConditions((prev) => prev.map((c, i) => (i === index ? condition : c)));
    setPreview(null);
    setExecuteResult(null);
  }

  function handleConditionRemove(index: number) {
    setConditions((prev) => prev.filter((_, i) => i !== index));
    setPreview(null);
    setExecuteResult(null);
  }

  function handleAddCondition() {
    setConditions((prev) => [...prev, defaultCondition()]);
  }

  // Validate that at least one condition has a non-empty value
  const hasValidConditions = conditions.some((c) => c.value.trim() !== "");

  function handleSearch() {
    setError(null);
    setExecuteResult(null);
    startSearch(async () => {
      try {
        const result = await previewRuleTransactions(
          conditions.filter((c) => c.value.trim() !== ""),
          sourceCategoryId || null
        );
        setPreview(result);
      } catch {
        setError("Error al buscar transacciones. Inténtalo de nuevo.");
      }
    });
  }

  function handleExecute() {
    if (!targetCategoryId) {
      setError("Selecciona una categoría de destino antes de ejecutar.");
      return;
    }
    setError(null);
    setExecuteResult(null);
    startExecute(async () => {
      try {
        const result = await executeRuleOnce({
          conditions: conditions.filter((c) => c.value.trim() !== ""),
          sourceCategoryId: sourceCategoryId || null,
          categoryId: targetCategoryId,
          ruleName: ruleName.trim() || null,
        });
        const msg =
          result.categorized > 0
            ? `${result.categorized} transacción${result.categorized !== 1 ? "es" : ""} categorizada${result.categorized !== 1 ? "s" : ""}${result.savedRuleId ? " — regla guardada" : ""}.`
            : "Ninguna transacción nueva categorizada.";
        setExecuteResult(msg);
        // Refresh preview after execution
        if (result.categorized > 0) {
          const updated = await previewRuleTransactions(
            conditions.filter((c) => c.value.trim() !== ""),
            sourceCategoryId || null
          );
          setPreview(updated);
        }
      } catch {
        setError("Error al ejecutar la regla. Inténtalo de nuevo.");
      }
    });
  }

  const isPending = isSearching || isExecuting;

  return (
    <div className="space-y-6">
      {/* ── Builder card ── */}
      <Card>
        <CardContent className="p-4 md:p-6 space-y-5">
          {/* Rule name */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Nombre de la regla{" "}
              <span className="text-muted-foreground font-normal">
                (opcional, para guardarla)
              </span>
            </label>
            <input
              type="text"
              value={ruleName}
              onChange={(e) => setRuleName(e.target.value)}
              placeholder="Ej: Netflix, Supermercados, Nómina..."
              className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            />
          </div>

          {/* Conditions */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">
                Condiciones{" "}
                <span className="text-muted-foreground font-normal">
                  (todas deben cumplirse)
                </span>
              </label>
            </div>

            <div className="space-y-2">
              {conditions.map((condition, index) => (
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
              Añadir condición
            </Button>
          </div>

          {/* Source + Target categories */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Categoría origen{" "}
                <span className="text-muted-foreground font-normal">
                  (opcional)
                </span>
              </label>
              <p className="text-xs text-muted-foreground">
                Solo recategoriza desde esta categoría
              </p>
              <select
                value={sourceCategoryId}
                onChange={(e) => {
                  setSourceCategoryId(e.target.value);
                  setPreview(null);
                }}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <option value="">— Cualquier categoría —</option>
                <CategoryOptions categories={categories} />
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Categoría destino{" "}
                <span className="text-destructive">*</span>
              </label>
              <p className="text-xs text-muted-foreground">
                Categoría que se asignará al ejecutar
              </p>
              <select
                value={targetCategoryId}
                onChange={(e) => setTargetCategoryId(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <option value="">— Seleccionar categoría —</option>
                <CategoryOptions categories={categories} />
              </select>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {/* Execute result */}
          {executeResult && (
            <p className="text-sm text-green-600 font-medium">{executeResult}</p>
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
              Buscar transacciones
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
              Ejecutar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Preview results ── */}
      {isSearching && (
        <div className="rounded-xl border p-6 text-center">
          <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground mt-2">
            Buscando transacciones...
          </p>
        </div>
      )}

      {!isSearching && preview !== null && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Transacciones coincidentes</h3>
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
