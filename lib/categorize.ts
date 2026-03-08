// Shared helpers for transaction categorization queries

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
