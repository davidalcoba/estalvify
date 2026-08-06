import type { Metadata } from "next";
import { requireScope } from "@/lib/auth/scope";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingsForm } from "@/components/settings/settings-form";
import { PlanningForm } from "@/components/settings/planning-form";
import { CategoryManager } from "@/components/settings/category-manager";
import { PrivacyDataCard } from "@/components/settings/privacy-data-card";
import { MembersCard } from "@/components/settings/members-card";
import { listHouseholdPeople, type HouseholdPeople } from "@/lib/household/manage";
import { seedDefaultCategories } from "./actions";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const scope = await requireScope("read");
  const userId = scope.dataUserId;

  // Members management is owner-only; others never see the card (the actions
  // behind it require "admin" anyway).
  const people =
    scope.role === "OWNER" ? await listHouseholdPeople(scope.householdId) : null;

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
    return (
      <SettingsLayout
        user={user}
        categories={seeded}
        people={people}
        actorUserId={scope.actorUserId}
        role={scope.role}
      />
    );
  }

  return (
    <SettingsLayout
      user={user}
      categories={categories}
      people={people}
      actorUserId={scope.actorUserId}
      role={scope.role}
    />
  );
}

function SettingsLayout({
  user,
  categories,
  people,
  actorUserId,
  role,
}: {
  people: HouseholdPeople | null;
  actorUserId: string;
  role: "OWNER" | "EDITOR" | "VIEWER";
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
  // Per the role matrix (PLAN_MULTIUSER.md §5): a VIEWER edits nothing here
  // (the per-member personal-prefs split is phase 5); an EDITOR manages the
  // household settings and categories but never Privacy & data (export /
  // delete are the owner's — they act on the whole household's data).
  if (role === "VIEWER") {
    return (
      <div className="space-y-6">
        <PageHeader title="Settings" />
        <div className="max-w-lg">
          <Card>
            <CardHeader>
              <CardTitle>Read-only access</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Your role in this household is Viewer. Regional preferences,
              categories and data management are handled by the household
              owner and editors.
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

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

        {people && (
          <MembersCard
            members={people.members}
            invites={people.invites}
            currentUserId={actorUserId}
          />
        )}

        {role === "OWNER" && <PrivacyDataCard email={user?.email ?? ""} />}
      </div>
    </div>
  );
}
