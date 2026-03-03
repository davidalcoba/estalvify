// Categorize page — manual transaction categorization inbox

import type { Metadata } from "next";
import { Suspense } from "react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getUserPrefs } from "@/lib/user-prefs";
import { Skeleton } from "@/components/ui/skeleton";
import { CategorizeView } from "@/components/categorize/categorize-view";
import { buildUncategorizedWhere } from "@/lib/categorize";
import { toTransactionListItemDTO } from "@/lib/transactions/transaction-dto";

export const metadata: Metadata = { title: "Categorize" };

const PAGE_SIZES = [25, 50, 100, 200] as const;
const DEFAULT_SIZE = 100;
const ROW_COUNT = 8;

interface PageProps {
  searchParams: Promise<{ page?: string; size?: string }>;
}

// Skeleton for the full categorize body — shown during page/size changes
function CategorizeBodySkeleton() {
  return (
    <>
      {/* Desktop */}
      <div className="hidden md:block">
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Skeleton className="h-8 w-36 mb-2" />
              <Skeleton className="h-4 w-72" />
            </div>
            <Skeleton className="h-6 w-20 mt-1 rounded-full" />
          </div>

          <Skeleton className="h-9 w-full" />

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-52" />
              <Skeleton className="h-8 w-24" />
            </div>
            <Skeleton className="h-8 w-36" />
          </div>

          <div className="rounded-xl border overflow-hidden divide-y">
            <div className="flex items-center gap-3 px-3 py-2 bg-muted/20">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-3 w-20" />
            </div>
            {Array.from({ length: ROW_COUNT }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-3">
                <Skeleton className="h-4 w-4 rounded shrink-0" />
                <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                <div className="flex-1 min-w-0 space-y-1.5">
                  <Skeleton className="h-4 w-44" />
                  <Skeleton className="h-3 w-28" />
                </div>
                <Skeleton className="h-4 w-20 shrink-0" />
                <Skeleton className="h-8 w-32 shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Mobile */}
      <div className="md:hidden">
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Skeleton className="h-8 w-36 mb-2" />
              <Skeleton className="h-4 w-60" />
            </div>
            <Skeleton className="h-6 w-10 mt-1 rounded-full" />
          </div>

          <Skeleton className="h-10 w-full" />

          <div className="flex items-center justify-between">
            <Skeleton className="h-3 w-20" />
            <div className="flex items-center gap-1">
              <Skeleton className="h-7 w-7 rounded" />
              <Skeleton className="h-3 w-8" />
              <Skeleton className="h-7 w-7 rounded" />
            </div>
          </div>

          <div className="space-y-3">
            {Array.from({ length: ROW_COUNT }).map((_, i) => (
              <div key={i} className="rounded-xl border overflow-hidden">
                <div className="flex items-center gap-3 px-3 py-3">
                  <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <Skeleton className="h-4 w-44" />
                    <Skeleton className="h-3 w-28" />
                  </div>
                  <Skeleton className="h-4 w-20 shrink-0" />
                </div>
                <div className="px-3 pb-3">
                  <Skeleton className="h-9 w-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

interface CategorizeBodyProps {
  page: number;
  pageSize: number;
  pageSizeOptions: number[];
}

async function CategorizeBody({ page, pageSize, pageSizeOptions }: CategorizeBodyProps) {
  const session = await auth();
  const userId = session!.user.id;
  const where = buildUncategorizedWhere(userId);

  const [total, transactions, categories, prefs] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      include: { bankAccount: { select: { id: true, name: true } } },
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
    <CategorizeView
      transactions={transactions.map(toTransactionListItemDTO)}
      categories={categories}
      total={total}
      page={page}
      pageSize={pageSize}
      pageSizeOptions={pageSizeOptions}
      locale={prefs.locale}
      timezone={prefs.timezone}
    />
  );
}

export default async function CategorizePage({ searchParams }: PageProps) {
  const { page: pageStr, size: sizeStr } = await searchParams;

  const page = Math.max(1, parseInt(pageStr ?? "1") || 1);
  const sizeParam = parseInt(sizeStr ?? String(DEFAULT_SIZE)) || DEFAULT_SIZE;
  const pageSize = (PAGE_SIZES as readonly number[]).includes(sizeParam)
    ? sizeParam
    : DEFAULT_SIZE;

  // Changing key resets the Suspense boundary → shows skeleton while new data loads
  const bodyKey = `${page}-${pageSize}`;

  return (
    <Suspense key={bodyKey} fallback={<CategorizeBodySkeleton />}>
      <CategorizeBody page={page} pageSize={pageSize} pageSizeOptions={[...PAGE_SIZES]} />
    </Suspense>
  );
}
