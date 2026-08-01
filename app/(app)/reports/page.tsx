// Reports page — charts, trends, and financial scenarios

import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { BarChart3 } from "lucide-react";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Insights into your spending patterns, trends, and financial scenarios."
      />

      <EmptyState
        icon={BarChart3}
        title="Reports coming soon"
        description="Once you have some categorized transactions, you'll see spending breakdowns by category, monthly trends, income vs expenses charts, and budget vs actual comparisons."
      >
        <p className="text-sm text-muted-foreground">
          Connect a bank account and categorize some transactions to unlock reports.
        </p>
      </EmptyState>
    </div>
  );
}
