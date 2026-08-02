"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Repeat } from "lucide-react";
import { useAction } from "@/lib/use-action";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { RecurringSummaryCard } from "@/components/recurring/shared/recurring-summary";
import { RecurringDesktopView } from "@/components/recurring/views/recurring-desktop-view";
import { RecurringMobileView } from "@/components/recurring/views/recurring-mobile-view";
import type { RecurringRowAction } from "@/components/recurring/shared/recurring-item-row";
import type { RecurringSection } from "@/components/recurring/views/recurring-view-props";
import type { RecurringItem, RecurringSummary } from "@/lib/recurring/recurring-dto";
import {
  setRecurringDecision,
  clearRecurringDecision,
  addRecurringToPlan,
} from "@/app/(app)/recurring/actions";

// One key per (series, action) pair, so the button that was clicked is the one
// that spins — the rest of the list only greys out.
function rowKey(item: RecurringItem, action: RecurringRowAction) {
  return `${item.merchantKey}:${action}`;
}

interface RecurringViewProps {
  items: RecurringItem[];
  summary: RecurringSummary;
  currency: string;
  locale: string;
  dateLocale: string;
}

export function RecurringView({ items, summary, currency, locale, dateLocale }: RecurringViewProps) {
  const router = useRouter();
  const { run, pending, busy } = useAction();

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
    run(rowKey(item, status === "CONFIRMED" ? "confirm" : "ignore"), async () => {
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
    run(rowKey(item, "reset"), async () => {
      try {
        await clearRecurringDecision(item.merchantKey);
        router.refresh();
      } catch {
        // no-op
      }
    });
  }

  function handleAddToPlan(item: RecurringItem) {
    run(rowKey(item, "addToPlan"), async () => {
      try {
        await addRecurringToPlan({
          displayName: item.displayName,
          direction: item.direction,
          cadence: item.cadence,
          averageAmount: item.averageAmount,
          currency,
          categoryId: item.categoryId,
        });
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
    onAddToPlan: handleAddToPlan,
    busy: (item: RecurringItem, action: RecurringRowAction) => busy(rowKey(item, action)),
    disabled: pending,
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Recurring" />

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
              dateLocale={dateLocale}
              {...handlers}
            />
          </div>
          <div className="md:hidden">
            <RecurringMobileView
              sections={sections}
              currency={currency}
              locale={locale}
              dateLocale={dateLocale}
              {...handlers}
            />
          </div>
        </>
      )}
    </div>
  );
}
