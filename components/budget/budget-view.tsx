"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BudgetMonthDTO, BudgetCategoryDTO } from "@/lib/budget/budget-dto";
import { BudgetDesktopView } from "@/components/budget/views/budget-desktop-view";
import { BudgetMobileView } from "@/components/budget/views/budget-mobile-view";
import { AssignMoneySheet } from "@/components/budget/shared/assign-money-sheet";
import { CategoryTargetSheet } from "@/components/budget/shared/category-target-sheet";

interface BudgetViewProps {
  data: BudgetMonthDTO;
  locale: string;
}

export function BudgetView({ data, locale }: BudgetViewProps) {
  const router = useRouter();

  const [assigningCategory, setAssigningCategory] = useState<BudgetCategoryDTO | null>(null);
  const [targetCategory, setTargetCategory] = useState<BudgetCategoryDTO | null>(null);

  function navigate(year: number, month: number) {
    router.push(`/budget?year=${year}&month=${month}`);
  }

  function handlePrevMonth() {
    let y = data.year;
    let m = data.month - 1;
    if (m < 1) { m = 12; y -= 1; }
    navigate(y, m);
  }

  function handleNextMonth() {
    let y = data.year;
    let m = data.month + 1;
    if (m > 12) { m = 1; y += 1; }
    navigate(y, m);
  }

  const sharedProps = {
    data,
    locale,
    onPrevMonth: handlePrevMonth,
    onNextMonth: handleNextMonth,
    onAssign: setAssigningCategory,
    onSetTarget: setTargetCategory,
  };

  return (
    <>
      <AssignMoneySheet
        category={assigningCategory}
        year={data.year}
        month={data.month}
        locale={locale}
        currency={data.currency}
        onClose={() => setAssigningCategory(null)}
      />

      <CategoryTargetSheet
        category={targetCategory}
        onClose={() => setTargetCategory(null)}
      />

      <div className="hidden md:block">
        <BudgetDesktopView {...sharedProps} />
      </div>
      <div className="md:hidden">
        <BudgetMobileView {...sharedProps} />
      </div>
    </>
  );
}
