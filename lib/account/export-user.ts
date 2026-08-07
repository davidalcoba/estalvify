// GDPR data export (right to portability, art. 20).
//
// Everything the account owns, as one JSON document. Two deliberate omissions:
//
//  - `BankConnection.sessionId` — the Enable Banking session identifier is a
//    credential-adjacent value, not the user's data. Its metadata (bank,
//    status, consent expiry) is included.
//  - Internal ids stay in, because they are what makes the export navigable
//    (a transaction points at its account and category by id).
//
// Prisma Decimals and Dates serialize themselves (Decimal.toJSON → string,
// Date → ISO), so the shapes below are JSON-safe as returned.

import { prisma } from "@/lib/prisma";

export async function buildUserExport(userId: string) {
  const [
    user,
    household,
    bankConnections,
    bankAccounts,
    balances,
    transactions,
    categories,
    rules,
    budgets,
    plannedItems,
    recurringSeries,
    dismissedSuggestions,
    notifications,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        timezone: true,
        currency: true,
        locale: true,
        language: true,
        lowBalanceThreshold: true,
      },
    }),
    // The household record (name, members and their roles). Invite token
    // hashes are deliberately omitted — credential-adjacent, like sessionId.
    prisma.household.findUnique({
      where: { ownerUserId: userId },
      select: {
        name: true,
        createdAt: true,
        members: {
          select: {
            userId: true,
            role: true,
            createdAt: true,
            user: { select: { name: true, email: true } },
          },
        },
      },
    }),
    prisma.bankConnection.findMany({
      where: { userId },
      select: {
        id: true,
        bankId: true,
        bankName: true,
        country: true,
        status: true,
        consentExpiresAt: true,
        createdAt: true,
      },
    }),
    prisma.bankAccount.findMany({
      where: { userId },
      select: {
        id: true,
        bankConnectionId: true,
        name: true,
        ownerName: true,
        iban: true, // last 4 digits only — the full IBAN is never stored
        type: true,
        currency: true,
        isActive: true,
        createdAt: true,
      },
    }),
    prisma.accountBalance.findMany({
      where: { bankAccount: { userId } },
      select: {
        bankAccountId: true,
        date: true,
        balance: true,
        available: true,
        currency: true,
        balanceType: true,
      },
      orderBy: { date: "asc" },
    }),
    prisma.transaction.findMany({
      where: { userId },
      select: {
        id: true,
        bankAccountId: true,
        externalTransactionId: true,
        amount: true,
        currency: true,
        direction: true,
        valueDate: true,
        description: true,
        creditorIban: true,
        debtorIban: true,
        remittanceInfo: true,
        merchantCategoryCode: true,
        categorization: {
          select: {
            categoryId: true,
            status: true,
            source: true,
            note: true,
            categorizedAt: true,
          },
        },
      },
      orderBy: { valueDate: "asc" },
    }),
    prisma.category.findMany({
      // The user's own categories plus the shared system defaults their data
      // may reference — without those, categorized transactions dangle.
      where: { OR: [{ userId }, { userId: null }] },
      select: {
        id: true,
        name: true,
        description: true,
        color: true,
        icon: true,
        kind: true,
        isSystem: true,
        isActive: true,
        parentId: true,
      },
    }),
    prisma.categoryRule.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        categoryId: true,
        sourceCategoryId: true,
        conditions: true,
        isActive: true,
        priority: true,
        createdAt: true,
      },
      orderBy: { priority: "asc" },
    }),
    prisma.budget.findMany({
      where: { userId },
      select: {
        id: true,
        year: true,
        month: true,
        name: true,
        budgetItems: {
          select: {
            categoryId: true,
            plannedAmount: true,
            currency: true,
            notes: true,
            rollover: true,
          },
        },
      },
    }),
    prisma.plannedItem.findMany({
      where: { userId },
      select: {
        id: true,
        description: true,
        direction: true,
        categoryId: true,
        amount: true,
        currency: true,
        year: true,
        month: true,
        dueDay: true,
        windowFromDay: true,
        windowToDay: true,
        anchorMonthEnd: true,
        bankAccountId: true,
        recurringSeriesId: true,
        status: true,
        matchedTransactionId: true,
        matchedAmount: true,
      },
    }),
    prisma.recurringSeries.findMany({
      where: { userId },
      select: {
        id: true,
        merchantKey: true,
        displayName: true,
        direction: true,
        categoryId: true,
        cadence: true,
        expectedAmount: true,
        currency: true,
        windowFromDay: true,
        windowToDay: true,
        anchorMonthEnd: true,
        bankAccountId: true,
        active: true,
        lastSeenAt: true,
        nextExpectedDate: true,
      },
    }),
    prisma.dismissedRecurringSuggestion.findMany({
      where: { userId },
      select: { merchantKey: true, createdAt: true },
    }),
    prisma.notification.findMany({
      where: { userId },
      select: {
        type: true,
        severity: true,
        title: true,
        body: true,
        readAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    format: "estalvify-export/v1",
    user,
    household,
    bankConnections,
    bankAccounts,
    balances,
    transactions,
    categories,
    rules,
    budgets,
    plannedItems,
    recurringSeries,
    dismissedSuggestions,
    notifications,
  };
}
