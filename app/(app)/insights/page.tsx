// Insights page — AI-generated recommendations from an anonymized financial summary.

import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { InsightsView } from "@/components/insights/insights-view";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("nav.insights") };
}

export default async function InsightsPage() {
  const t = await getT();

  return (
    <div className="space-y-6">
      <PageHeader title={t("nav.insights")} />
      <InsightsView />
    </div>
  );
}
