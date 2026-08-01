"use client";

import { Card, CardContent } from "@/components/ui/card";
import { RecurringItemRow } from "@/components/recurring/shared/recurring-item-row";
import type { RecurringListViewProps } from "./recurring-view-props";

// Desktop layout: each status section is a card with divided rows.
export function RecurringDesktopView({
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
          <Card>
            <CardContent className="divide-y py-1">
              {section.items.map((item) => (
                <RecurringItemRow
                  key={item.merchantKey}
                  item={item}
                  currency={currency}
                  locale={locale}
                  onConfirm={onConfirm}
                  onIgnore={onIgnore}
                  onReset={onReset}
                  disabled={disabled}
                />
              ))}
            </CardContent>
          </Card>
        </section>
      ))}
    </div>
  );
}
