// Rules page — create and manage transaction categorization rules

import type { Metadata } from "next";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getUserPrefs } from "@/lib/user-prefs";
import { RulesView } from "@/components/rules/rules-view";
import { toCategoryRuleDTO } from "@/lib/rules/rule-dto";

export const metadata: Metadata = { title: "Reglas" };

export default async function RulesPage() {
  const session = await auth();
  const userId = session!.user.id;

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
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    }),
    getUserPrefs(userId),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Reglas</h2>
        <p className="text-muted-foreground text-sm">
          Crea reglas para categorizar transacciones de forma automática.
        </p>
      </div>

      <RulesView
        categories={categories}
        savedRules={savedRules.map(toCategoryRuleDTO)}
        locale={prefs.locale}
      />
    </div>
  );
}
