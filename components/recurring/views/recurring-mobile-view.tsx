"use client";

import { Card, CardContent } from "@/components/ui/card";
import { RecurringItemRow } from "@/components/recurring/shared/recurring-item-row";
import type { RecurringListViewProps } from "./recurring-view-props";

// Mobile layout: each series is its own card for larger touch targets.
export function RecurringMobileView({
  sections,
  currency,
  locale,
  onConfirm,
  onIgnore,
  onReset,
  disabled,
}: RecurringListViewProps) {
  return (
    <div className="space-y-6">
      {sections.map((section) => (
        <section key={section.key} className="space-y-2">
          <div>
            <h3 className="text-sm font-medium">{section.title}</h3>
            {section.description && (
              <p className="text-xs text-muted-foreground">{section.description}</p>
            )}
          </div>
          <div className="space-y-2">
            {section.items.map((item) => (
              <Card key={item.merchantKey}>
                <CardContent className="py-0">
                  <RecurringItemRow
                    item={item}
                    currency={currency}
                    locale={locale}
                    onConfirm={onConfirm}
                    onIgnore={onIgnore}
                    onReset={onReset}
                    disabled={disabled}
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
