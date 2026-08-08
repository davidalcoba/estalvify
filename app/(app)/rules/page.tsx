// Rules page — create and manage transaction categorization rules

import type { Metadata } from "next";
import { requireScope } from "@/lib/auth/scope";
import { prisma } from "@/lib/prisma";
import { getUserPrefs } from "@/lib/user-prefs";
import { PageHeader } from "@/components/layout/page-header";
import { RulesView } from "@/components/rules/rules-view";
import { toCategoryRuleDTO } from "@/lib/rules/rule-dto";
import { EmptyState } from "@/components/ui/empty-state";
import { Eye } from "lucide-react";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("nav.rules") };
}

export default async function RulesPage() {
  // The rules editor is configuration tooling, all of it mutating (create,
  // reorder, run, toggle). A VIEWER gets an explanation instead of a page of
  // dead controls (the sidebar also hides this route for them).
  const scope = await requireScope("read");
  const t = await getT();
  if (scope.role === "VIEWER") {
    return (
      <div className="space-y-4">
        <PageHeader title={t("nav.rules")} />
        <EmptyState
          icon={Eye}
          title={t("rules.viewer.title")}
          description={t("rules.viewer.body")}
        />
      </div>
    );
  }
  const userId = scope.dataUserId;

  const [categories, savedRules, prefs] = await Promise.all([
    prisma.category.findMany({
      where: { isActive: true, OR: [{ userId }, { userId: null }] },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.categoryRule.findMany({
      where: { userId },
      include: {
        category: { select: { name: true, color: true } },
        sourceCategory: { select: { name: true, color: true } },
      },
      // Evaluation order: lower priority number runs first and wins. Listing
      // them backwards made the UI contradict the rule it is about to explain.
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    }),
    getUserPrefs(userId, scope.actorUserId),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader title={t("nav.rules")} />

      <RulesView
        categories={categories}
        savedRules={savedRules.map(toCategoryRuleDTO)}
        locale={prefs.locale}
      />
    </div>
  );
}
