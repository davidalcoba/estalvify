// Categorize page — manual transaction categorization inbox

import type { Metadata } from "next";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getUserPrefs } from "@/lib/user-prefs";
import { CategorizeInbox } from "@/components/categorize/categorize-inbox";
import { buildUncategorizedWhere } from "./actions";

export const metadata: Metadata = { title: "Categorize" };

const PAGE_SIZE = 50;

interface PageProps {
  searchParams: Promise<{ q?: string; page?: string }>;
}

export default async function CategorizePage({ searchParams }: PageProps) {
  const session = await auth();
  const { q, page: pageStr } = await searchParams;

  const userId = session!.user.id;
  const page = Math.max(1, parseInt(pageStr ?? "1") || 1);

  const where = buildUncategorizedWhere(userId, q);

  const [total, transactions, categories, prefs] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      include: { bankAccount: { select: { name: true } } },
      orderBy: { bookingDate: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.category.findMany({
      where: { userId, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    getUserPrefs(userId),
  ]);

  return (
    <CategorizeInbox
      transactions={transactions}
      categories={categories}
      total={total}
      page={page}
      pageSize={PAGE_SIZE}
      initialQuery={q ?? ""}
      locale={prefs.locale}
      currency={prefs.currency}
      timezone={prefs.timezone}
    />
  );
}
