// Categorize page — manual transaction categorization inbox

import type { Metadata } from "next";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getUserPrefs } from "@/lib/user-prefs";
import { CategorizeInbox } from "@/components/categorize/categorize-inbox";
import { buildUncategorizedWhere } from "@/lib/categorize";

export const metadata: Metadata = { title: "Categorize" };

const PAGE_SIZES = [25, 50, 100, 200] as const;
const DEFAULT_SIZE = 100;

interface PageProps {
  searchParams: Promise<{ page?: string; size?: string }>;
}

export default async function CategorizePage({ searchParams }: PageProps) {
  const session = await auth();
  const { page: pageStr, size: sizeStr } = await searchParams;

  const userId = session!.user.id;
  const page = Math.max(1, parseInt(pageStr ?? "1") || 1);
  const sizeParam = parseInt(sizeStr ?? String(DEFAULT_SIZE)) || DEFAULT_SIZE;
  const pageSize = (PAGE_SIZES as readonly number[]).includes(sizeParam)
    ? sizeParam
    : DEFAULT_SIZE;

  const where = buildUncategorizedWhere(userId);

  const [total, transactions, categories, prefs] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      include: { bankAccount: { select: { name: true } } },
      orderBy: [{ bookingDate: "desc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
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
      pageSize={pageSize}
      pageSizeOptions={[...PAGE_SIZES]}
      locale={prefs.locale}
      currency={prefs.currency}
      timezone={prefs.timezone}
    />
  );
}
