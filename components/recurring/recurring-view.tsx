"use client";

import { useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Repeat } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { RecurringSummaryCard } from "@/components/recurring/shared/recurring-summary";
import { RecurringDesktopView } from "@/components/recurring/views/recurring-desktop-view";
import { RecurringMobileView } from "@/components/recurring/views/recurring-mobile-view";
import type { RecurringSection } from "@/components/recurring/views/recurring-view-props";
import type { RecurringItem, RecurringSummary } from "@/lib/recurring/recurring-dto";
import {
  setRecurringDecision,
  clearRecurringDecision,
} from "@/app/(app)/recurring/actions";

interface RecurringViewProps {
  items: RecurringItem[];
  summary: RecurringSummary;
  currency: string;
  locale: string;
}

export function RecurringView({ items, summary, currency, locale }: RecurringViewProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const sections = useMemo<RecurringSection[]>(() => {
    const suggested = items.filter((i) => i.status === "SUGGESTED");
    const confirmed = items.filter((i) => i.status === "CONFIRMED");
    const ignored = items.filter((i) => i.status === "IGNORED");

    const result: RecurringSection[] = [];
    if (suggested.length > 0) {
      result.push({
        key: "suggested",
        title: `Suggested (${suggested.length})`,
        description:
          "Detected in your transaction history — confirm the ones that are really recurring.",
        items: suggested,
      });
    }
    if (confirmed.length > 0) {
      result.push({ key: "confirmed", title: `Confirmed (${confirmed.length})`, items: confirmed });
    }
    if (ignored.length > 0) {
      result.push({ key: "ignored", title: `Ignored (${ignored.length})`, items: ignored });
    }
    return result;
  }, [items]);

  function applyDecision(item: RecurringItem, status: "CONFIRMED" | "IGNORED") {
    startTransition(async () => {
      try {
        await setRecurringDecision({
          merchantKey: item.merchantKey,
          displayName: item.displayName,
          direction: item.direction,
          cadence: item.cadence,
          averageAmount: item.averageAmount,
          currency,
          lastSeen: item.lastSeen,
          nextExpected: item.nextExpected,
          categoryId: item.categoryId,
          status,
        });
        router.refresh();
      } catch {
        // A refresh will restore the true state.
      }
    });
  }

  function handleReset(item: RecurringItem) {
    startTransition(async () => {
      try {
        await clearRecurringDecision(item.merchantKey);
        router.refresh();
      } catch {
        // no-op
      }
    });
  }

  const handlers = {
    onConfirm: (item: RecurringItem) => applyDecision(item, "CONFIRMED"),
    onIgnore: (item: RecurringItem) => applyDecision(item, "IGNORED"),
    onReset: handleReset,
    disabled: pending,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recurring"
        description="Subscriptions and regular payments detected from your bank history."
      />

      {items.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title="No recurring payments detected yet"
          description="As more transactions sync, subscriptions and regular payments (rent, salary, memberships…) will show up here for you to confirm."
        />
      ) : (
        <>
          <RecurringSummaryCard summary={summary} currency={currency} locale={locale} />

          <div className="hidden md:block">
            <RecurringDesktopView
              sections={sections}
              currency={currency}
              locale={locale}
              {...handlers}
            />
          </div>
          <div className="md:hidden">
            <RecurringMobileView
              sections={sections}
              currency={currency}
              locale={locale}
              {...handlers}
            />
          </div>
        </>
      )}
    </div>
  );
}
