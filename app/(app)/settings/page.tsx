import type { Metadata } from "next";
import { requireScope } from "@/lib/auth/scope";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { SettingsForm } from "@/components/settings/settings-form";
import { PlanningForm } from "@/components/settings/planning-form";
import { CategoryManager } from "@/components/settings/category-manager";
import { PrivacyDataCard } from "@/components/settings/privacy-data-card";
import { seedDefaultCategories } from "./actions";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { dataUserId: userId } = await requireScope("read");

  const [user, categories] = await Promise.all([
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
    return <SettingsLayout user={user} categories={seeded} />;
  }

  return <SettingsLayout user={user} categories={categories} />;
}

function SettingsLayout({
  user,
  categories,
}: {
  user: {
    email?: string | null;
    timezone?: string | null;
    currency?: string | null;
    locale?: string | null;
    language?: string | null;
    lowBalanceThreshold?: { toString(): string } | null;
  } | null;
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
          currency={user?.currency ?? "EUR"}
        />

        <CategoryManager initialCategories={categories} />

        <PrivacyDataCard email={user?.email ?? ""} />
      </div>
    </div>
  );
}
