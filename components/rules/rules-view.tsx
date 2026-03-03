// Rules page orchestrator — composes builder form and saved rules list

import { RuleBuilderForm } from "@/components/rules/rule-builder-form";
import { SavedRulesList } from "@/components/rules/saved-rules-list";
import { Separator } from "@/components/ui/separator";
import type { Category } from "@/components/categorize/category-options";
import type { CategoryRuleDTO } from "@/lib/rules/rule-dto";

interface RulesViewProps {
  categories: Category[];
  savedRules: CategoryRuleDTO[];
  locale: string;
}

export function RulesView({ categories, savedRules, locale }: RulesViewProps) {
  return (
    <div className="space-y-8">
      {/* ── New rule builder ── */}
      <section>
        <div className="mb-4">
          <h3 className="text-base font-semibold">Nueva regla</h3>
          <p className="text-sm text-muted-foreground">
            Define las condiciones, busca las transacciones que coinciden y
            ejecútala para categorizarlas.
          </p>
        </div>
        <RuleBuilderForm categories={categories} locale={locale} />
      </section>

      <Separator />

      {/* ── Saved rules list ── */}
      <section>
        <div className="mb-4">
          <h3 className="text-base font-semibold">
            Reglas guardadas
            {savedRules.length > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({savedRules.length})
              </span>
            )}
          </h3>
          <p className="text-sm text-muted-foreground">
            Las reglas con nombre se guardan aquí para poder ejecutarlas de
            nuevo en cualquier momento.
          </p>
        </div>
        <SavedRulesList rules={savedRules} />
      </section>
    </div>
  );
}
