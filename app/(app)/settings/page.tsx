import type { Metadata } from "next";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { SettingsForm } from "@/components/settings/settings-form";
import { CategoryManager } from "@/components/settings/category-manager";
import { seedDefaultCategories } from "./actions";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const session = await auth();
  const userId = session!.user.id;

  const [user, categories] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, timezone: true, currency: true, locale: true },
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
    await seedDefaultCategories(userId);
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
  user: { timezone?: string | null; currency?: string | null; locale?: string | null } | null;
  categories: {
    id: string;
    name: string;
    color: string;
    children: { id: string; name: string; color: string }[];
  }[];
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground">Manage your account and regional preferences.</p>
      </div>

      <div className="max-w-lg space-y-6">
        <SettingsForm
          timezone={user?.timezone ?? "Europe/London"}
          currency={user?.currency ?? "EUR"}
          locale={user?.locale ?? "es-ES"}
        />

        <CategoryManager initialCategories={categories} />
      </div>
    </div>
  );
}
