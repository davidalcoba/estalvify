import type { Metadata } from "next";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { SettingsForm } from "@/components/settings/settings-form";
import { PlanningForm } from "@/components/settings/planning-form";
import { CategoryManager } from "@/components/settings/category-manager";
import { seedDefaultCategories } from "./actions";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const session = await auth();
  const userId = session!.user.id;

  const [user, categories, bankAccounts] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        email: true,
        timezone: true,
        currency: true,
        locale: true,
        language: true,
        lowBalanceThreshold: true,
        savingsGoalAmount: true,
        savingsGoalPercent: true,
        savingsAccountId: true,
      },
    }),
    prisma.category.findMany({
      where: { userId, parentId: null, isActive: true },
      include: {
        children: {
          where: { isActive: true },
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.bankAccount.findMany({
      where: { userId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // Seed default categories for new users
  if (categories.length === 0) {
    await seedDefaultCategories();
    const seeded = await prisma.category.findMany({
      where: { userId, parentId: null, isActive: true },
      include: {
        children: {
          where: { isActive: true },
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: { sortOrder: "asc" },
    });
    return <SettingsLayout user={user} categories={seeded} bankAccounts={bankAccounts} />;
  }

  return <SettingsLayout user={user} categories={categories} bankAccounts={bankAccounts} />;
}

function SettingsLayout({
  user,
  categories,
  bankAccounts,
}: {
  user: {
    timezone?: string | null;
    currency?: string | null;
    locale?: string | null;
    language?: string | null;
    lowBalanceThreshold?: { toString(): string } | null;
    savingsGoalAmount?: { toString(): string } | null;
    savingsGoalPercent?: { toString(): string } | null;
    savingsAccountId?: string | null;
  } | null;
  bankAccounts: { id: string; name: string }[];
  categories: {
    id: string;
    name: string;
    color: string;
    children: { id: string; name: string; color: string }[];
  }[];
}) {
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" />

      <div className="max-w-lg space-y-6">
        <SettingsForm
          timezone={user?.timezone ?? "Europe/London"}
          currency={user?.currency ?? "EUR"}
          locale={user?.locale ?? "es-ES"}
          language={user?.language ?? "en-GB"}
        />

        <PlanningForm
          lowBalanceThreshold={Number(user?.lowBalanceThreshold?.toString() ?? "0")}
          savingsGoalAmount={
            user?.savingsGoalAmount ? Number(user.savingsGoalAmount.toString()) : null
          }
          savingsGoalPercent={
            user?.savingsGoalPercent ? Number(user.savingsGoalPercent.toString()) : null
          }
          savingsAccountId={user?.savingsAccountId ?? null}
          accounts={bankAccounts}
          currency={user?.currency ?? "EUR"}
        />

        <CategoryManager initialCategories={categories} />
      </div>
    </div>
  );
}
