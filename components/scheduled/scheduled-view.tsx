"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
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

// null = closed, "new" = creating, DTO = editing
type ModalState = null | "new" | ScheduledTransactionDTO;

export function ScheduledView({
  transactions,
  bankAccounts,
  categories,
  locale,
  timezone,
  currency,
}: ScheduledViewProps) {
  const [modalState, setModalState] = useState<ModalState>(null);

  const modalTitle =
    modalState === "new"
      ? "New scheduled transaction"
      : modalState
      ? `Edit: ${modalState.payeeName}`
      : "";

  const formTx = modalState === "new" || modalState === null ? undefined : modalState;

  const sharedProps = {
    transactions,
    locale,
    timezone,
    currency,
    onEdit: (tx: ScheduledTransactionDTO) => setModalState(tx),
  };

  return (
    <>
      <ResponsiveModal
        open={modalState !== null}
        onOpenChange={(open) => !open && setModalState(null)}
        title={modalTitle}
      >
        {modalState !== null && (
          <ScheduledTransactionForm
            existing={formTx}
            bankAccounts={bankAccounts}
            categories={categories}
            onSuccess={() => setModalState(null)}
            onCancel={() => setModalState(null)}
          />
        )}
      </ResponsiveModal>

      <div className="flex items-center justify-end mb-4">
        <Button onClick={() => setModalState("new")}>
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
