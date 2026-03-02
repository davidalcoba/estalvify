"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, CreditCard, Tag } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { TransactionAmount } from "@/components/transactions/shared/transaction-amount";
import { CategoryChip } from "@/components/transactions/shared/category-chip";
import { type Category } from "@/components/categorize/category-options";
import { categorizeTransaction } from "@/app/(app)/categorize/actions";
import {
  transactionMerchant,
  transactionOperationType,
  type TransactionListItemDTO,
} from "@/lib/transactions/transaction-dto";

interface TransactionDetailDialogProps {
  transaction: TransactionListItemDTO | null;
  locale: string;
  timezone: string;
  categories: Category[];
  onClose: () => void;
}

export function TransactionDetailDialog({
  transaction,
  locale,
  timezone,
  categories,
  onClose,
}: TransactionDetailDialogProps) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);

  const categorySections = useMemo(() => {
    const parents = categories.filter((c) => !c.parentId);
    return parents.map((parent) => ({
      parent,
      children: categories.filter((c) => c.parentId === parent.id),
    }));
  }, [categories]);

  if (!transaction) return null;

  async function handleRecategorize(categoryId: string) {
    if (!categoryId || !transaction) return;
    setSheetOpen(false);
    await categorizeTransaction(transaction.id, categoryId);
    router.refresh();
  }

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent
          className="w-[min(96vw,680px)] max-h-[85vh] overflow-hidden p-0 gap-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogTitle className="sr-only">Transaction details</DialogTitle>

          <div className="px-5 py-4 border-b">
            <p className="text-sm text-muted-foreground">{transactionOperationType(transaction)}</p>
            <p className="text-lg font-semibold leading-tight">{transactionMerchant(transaction)}</p>
          </div>

          <div className="px-5 py-4 space-y-4 overflow-y-auto">
            <TransactionAmount
              amount={transaction.amount}
              currency={transaction.currency}
              direction={transaction.direction}
              locale={locale}
              className="text-2xl"
            />

            <div className="grid gap-2 text-sm">
              <p className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-4 w-4" />
                {new Date(transaction.bookingDate).toLocaleDateString(locale, {
                  timeZone: timezone,
                  weekday: "short",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
              <p className="flex items-center gap-2 text-muted-foreground">
                <CreditCard className="h-4 w-4" />
                {transaction.bankAccount.name}
              </p>
              {transaction.categoryName && (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Tag className="h-4 w-4" />
                  <CategoryChip
                    name={transaction.categoryName}
                    color={transaction.categoryColor}
                  />
                </p>
              )}
            </div>

            {categories.length > 0 && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setSheetOpen(true)}
              >
                {transaction.categoryName ? "Change category" : "Categorize"}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="max-h-[75vh]">
          <SheetHeader className="pb-2">
            <SheetTitle>Choose a category</SheetTitle>
            <SheetDescription className="line-clamp-2">
              {transactionMerchant(transaction)}
            </SheetDescription>
          </SheetHeader>

          <div className="overflow-y-auto px-4 pb-5 space-y-4">
            {categorySections.map(({ parent, children }) => (
              <div key={parent.id} className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {parent.name}
                </p>
                {children.length === 0 ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => handleRecategorize(parent.id)}
                  >
                    {parent.name}
                  </Button>
                ) : (
                  <div className="grid grid-cols-1 gap-2">
                    {children.map((child) => (
                      <Button
                        key={child.id}
                        variant="outline"
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => handleRecategorize(child.id)}
                      >
                        {child.name}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
