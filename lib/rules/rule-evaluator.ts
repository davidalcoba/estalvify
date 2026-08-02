// SQL prefilter for rule matching.
//
// Condition evaluation itself lives in rule-matcher.ts and runs in memory —
// accent folding, word boundaries, regex and the `any` field are not expressible
// in a Prisma `where`. This module only narrows what gets loaded: the user's own
// transactions, optionally restricted to a source category.

import type { Prisma } from "@/app/generated/prisma";

export interface PrefilterOptions {
  /** Only rows with no categorization yet (or a rejected one) — used by the sync auto-run. */
  onlyUncategorized?: boolean;
}

export function buildRulePrefilterWhere(
  userId: string,
  sourceCategoryId: string | null,
  options: PrefilterOptions = {}
): Prisma.TransactionWhereInput {
  const clauses: Prisma.TransactionWhereInput[] = [{ userId }];

  // Source category filter: only match transactions already in that category.
  if (sourceCategoryId) {
    clauses.push({
      categorization: {
        categoryId: sourceCategoryId,
        status: "APPROVED",
      },
    });
  } else if (options.onlyUncategorized) {
    clauses.push({
      OR: [{ categorization: null }, { categorization: { status: "REJECTED" } }],
    });
  }

  return { AND: clauses };
}
