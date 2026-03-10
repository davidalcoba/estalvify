// Scheduled transactions page — future recurring income and expenses

import type { Metadata } from "next";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getUserPrefs } from "@/lib/user-prefs";
import { toScheduledTransactionDTO } from "@/lib/scheduled/scheduled-dto";
import { ScheduledView } from "@/components/scheduled/scheduled-view";
import { CalendarClock } from "lucide-react";

export const metadata: Metadata = { title: "Scheduled Transactions" };

export default async function ScheduledPage() {
  const session = await auth();
  const userId = session!.user.id;
  const { locale, currency, timezone } = await getUserPrefs(userId);

  const [rawTransactions, bankAccounts, categories] = await Promise.all([
    prisma.scheduledTransaction.findMany({
      where: { userId },
      include: {
        category: { select: { name: true, color: true } },
        bankAccount: { select: { name: true } },
      },
      orderBy: [{ isActive: "desc" }, { nextDate: "asc" }],
    }),
    prisma.bankAccount.findMany({
      where: { userId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.category.findMany({
      where: {
        OR: [{ userId }, { userId: null }],
        isActive: true,
      },
      select: { id: true, name: true, parentId: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);

  const transactions = rawTransactions.map(toScheduledTransactionDTO);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-2xl font-bold tracking-tight">Scheduled</h2>
        </div>
        <p className="text-muted-foreground mt-1">
          Manage recurring income, expenses, and reminders.
        </p>
      </div>

      <ScheduledView
        transactions={transactions}
        bankAccounts={bankAccounts}
        categories={categories}
        locale={locale}
        timezone={timezone}
        currency={currency}
      />
    </div>
  );
}
