// Budget page — monthly budget planning by category
// Zero-based budgeting: plan where every euro goes before the month starts

import type { Metadata } from "next";
import { auth } from "@/auth";
import { getUserPrefs } from "@/lib/user-prefs";
import { formatDate } from "@/lib/formatters";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { PiggyBank, Plus } from "lucide-react";

export const metadata: Metadata = { title: "Budget" };

export default async function BudgetPage() {
  const session = await auth();
  const { locale, timezone } = await getUserPrefs(session!.user.id);

  const currentMonth = formatDate(new Date(), locale, timezone, {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Budget"
        description={`Plan your spending for ${currentMonth}.`}
        actions={
          <Button disabled>
            <Plus className="mr-2 h-4 w-4" />
            Add Category
          </Button>
        }
      />

      <EmptyState
        icon={PiggyBank}
        title="Create your first budget"
        description="Set spending targets for each category and track your progress throughout the month. Categorize some transactions first to get started."
      >
        <Button variant="outline" disabled>
          <Plus className="mr-2 h-4 w-4" />
          Set up budget
        </Button>
      </EmptyState>
    </div>
  );
}
