// Insights page — AI-generated recommendations from an anonymized financial summary.

import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { InsightsView } from "@/components/insights/insights-view";

export const metadata: Metadata = { title: "Insights" };

export default function InsightsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Insights"
        description="AI recommendations tailored to your money."
      />
      <InsightsView />
    </div>
  );
}
