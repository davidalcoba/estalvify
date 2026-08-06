// Rules page — create and manage transaction categorization rules

import type { Metadata } from "next";
import { requireScope } from "@/lib/auth/scope";
import { prisma } from "@/lib/prisma";
import { getUserPrefs } from "@/lib/user-prefs";
import { PageHeader } from "@/components/layout/page-header";
import { RulesView } from "@/components/rules/rules-view";
import { toCategoryRuleDTO } from "@/lib/rules/rule-dto";

export const metadata: Metadata = { title: "Rules" };

export default async function RulesPage() {
  const { dataUserId: userId } = await requireScope("read");

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
    getUserPrefs(userId),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader title="Rules" />

      <RulesView
        categories={categories}
        savedRules={savedRules.map(toCategoryRuleDTO)}
        locale={prefs.locale}
      />
    </div>
  );
}
