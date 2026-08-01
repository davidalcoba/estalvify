// Shared helpers for transaction categorization queries

/**
 * Client-side search predicate for the categorize inbox: case-insensitive match
 * against a transaction's description or remittance info. Shared by the
 * orchestrator and both device views (previously copy-pasted in each).
 */
export function matchesTransactionSearch(
  tx: { description: string | null; remittanceInfo: string | null },
  query: string
): boolean {
  const lower = query.toLowerCase();
  return [tx.description, tx.remittanceInfo].some((f) => f?.toLowerCase().includes(lower));
}

export function buildUncategorizedWhere(userId: string, searchQuery?: string) {
  const conditions: object[] = [
    { userId },
    {
      OR: [
        { categorization: null },
        { categorization: { status: "REJECTED" } },
      ],
    },
  ];

  const q = searchQuery?.trim();
  if (q) {
    conditions.push({
      OR: [
        { description: { contains: q, mode: "insensitive" } },
        { remittanceInfo: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  return { AND: conditions };
}
