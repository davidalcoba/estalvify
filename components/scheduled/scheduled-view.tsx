"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import type { ScheduledTransactionDTO } from "@/lib/scheduled/scheduled-dto";
import { ScheduledDesktopView } from "@/components/scheduled/views/scheduled-desktop-view";
import { ScheduledMobileView } from "@/components/scheduled/views/scheduled-mobile-view";
import { ScheduledTransactionForm } from "@/components/scheduled/shared/scheduled-transaction-form";

interface BankAccountOption {
  id: string;
  name: string;
}

interface CategoryOption {
  id: string;
  name: string;
  parentId: string | null;
}

interface ScheduledViewProps {
  transactions: ScheduledTransactionDTO[];
  bankAccounts: BankAccountOption[];
  categories: CategoryOption[];
  locale: string;
  timezone: string;
  currency: string;
}

// null = sheet closed, "new" = creating, DTO = editing
type SheetState = null | "new" | ScheduledTransactionDTO;

export function ScheduledView({
  transactions,
  bankAccounts,
  categories,
  locale,
  timezone,
  currency,
}: ScheduledViewProps) {
  const [sheetState, setSheetState] = useState<SheetState>(null);

  const sheetTitle =
    sheetState === "new"
      ? "New scheduled transaction"
      : sheetState
      ? `Edit: ${sheetState.payeeName}`
      : "";

  const formTx = sheetState === "new" || sheetState === null ? undefined : sheetState;

  const sharedProps = {
    transactions,
    locale,
    timezone,
    currency,
    onEdit: (tx: ScheduledTransactionDTO) => setSheetState(tx),
  };

  return (
    <>
      <Sheet open={sheetState !== null} onOpenChange={(open) => !open && setSheetState(null)}>
        <SheetContent side="right" className="w-full sm:max-w-sm overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{sheetTitle}</SheetTitle>
          </SheetHeader>
          <div className="mt-6 px-1">
            {sheetState !== null && (
              <ScheduledTransactionForm
                existing={formTx}
                bankAccounts={bankAccounts}
                categories={categories}
                onSuccess={() => setSheetState(null)}
                onCancel={() => setSheetState(null)}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Page-level "New" button — visible on both breakpoints */}
      <div className="flex items-center justify-end mb-4">
        <Button onClick={() => setSheetState("new")}>
          <Plus className="mr-2 h-4 w-4" />
          New scheduled
        </Button>
      </div>

      <div className="hidden md:block">
        <ScheduledDesktopView {...sharedProps} />
      </div>
      <div className="md:hidden">
        <ScheduledMobileView {...sharedProps} />
      </div>
    </>
  );
}
