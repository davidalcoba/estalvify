// Rules page orchestrator — composes builder form and saved rules list

import { Separator } from "@/components/ui/separator";
import { RuleBuilderForm } from "@/components/rules/rule-builder-form";
import { RulesDesktopView } from "@/components/rules/views/rules-desktop-view";
import { RulesMobileView } from "@/components/rules/views/rules-mobile-view";
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
      {/* ── Rule builder ── */}
      <section>
        <div className="mb-4">
          <h3 className="text-base font-semibold">New rule</h3>
        </div>
        <RuleBuilderForm categories={categories} locale={locale} />
      </section>

      <Separator />

      {/* ── Saved rules ── */}
      <section>
        <div className="mb-4 space-y-1">
          <h3 className="text-base font-semibold">
            Saved rules
            {savedRules.length > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({savedRules.length})
              </span>
            )}
          </h3>
          {savedRules.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Rules run top to bottom and the first match wins. Drag a rule to
              move it.
            </p>
          )}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block">
          <RulesDesktopView rules={savedRules} categories={categories} />
        </div>

        {/* Mobile cards */}
        <div className="md:hidden">
          <RulesMobileView rules={savedRules} categories={categories} />
        </div>
      </section>
    </div>
  );
}
