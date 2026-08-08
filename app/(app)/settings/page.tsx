import type { Metadata } from "next";
import { requireScope } from "@/lib/auth/scope";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getUserPrefs, type UserPrefs } from "@/lib/user-prefs";
import { SettingsForm } from "@/components/settings/settings-form";
import { PlanningForm } from "@/components/settings/planning-form";
import { CategoryManager } from "@/components/settings/category-manager";
import { PrivacyDataCard } from "@/components/settings/privacy-data-card";
import { MembersCard } from "@/components/settings/members-card";
import { PushToggle } from "@/components/settings/push-toggle";
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

  // Merged prefs: personal fields (timezone/language/number format) come from
  // the ACTING member's row, the currency from the household owner's.
  const [prefs, user, categories, pushSubscriptions] = await Promise.all([
    getUserPrefs(userId, scope.actorUserId),
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        email: true,
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
    // Initial state only — PushToggle reconciles against the browser on mount,
    // since the row can outlive the real subscription.
    prisma.pushSubscription.count({ where: { userId: scope.actorUserId } }),
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
        prefs={prefs}
        user={user}
        categories={seeded}
        people={people}
        actorUserId={scope.actorUserId}
        role={scope.role}
        pushSubscribed={pushSubscriptions > 0}
      />
    );
  }

  return (
    <SettingsLayout
      prefs={prefs}
      user={user}
      categories={categories}
      people={people}
      actorUserId={scope.actorUserId}
      role={scope.role}
      pushSubscribed={pushSubscriptions > 0}
    />
  );
}

function SettingsLayout({
  prefs,
  user,
  categories,
  people,
  actorUserId,
  role,
  pushSubscribed,
}: {
  prefs: UserPrefs;
  people: HouseholdPeople | null;
  actorUserId: string;
  role: "OWNER" | "EDITOR" | "VIEWER";
  pushSubscribed: boolean;
  user: {
    email?: string | null;
    lowBalanceThreshold?: { toString(): string } | null;
  } | null;
  categories: {
    id: string;
    name: string;
    color: string;
    children: { id: string; name: string; color: string }[];
  }[];
}) {
  // Per the role matrix (PLAN_MULTIUSER.md §5): a VIEWER edits only their
  // PERSONAL prefs (timezone/language/number format — their own row); an
  // EDITOR manages the household settings and categories but never Privacy &
  // data (export / delete are the owner's — they act on the whole household's
  // data).
  if (role === "VIEWER") {
    return (
      <div className="space-y-6">
        <PageHeader title="Settings" />
        <div className="max-w-lg space-y-6">
          <SettingsForm
            timezone={prefs.timezone}
            currency={prefs.currency}
            locale={prefs.locale}
            language={prefs.language}
            personalOnly
          />

          {/* Personal to this device, so it is not a household setting: a
              viewer sees the bell, so a viewer may be notified. */}
          <PushToggle subscribed={pushSubscribed} />

          <Card>
            <CardHeader>
              <CardTitle>Read-only access</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Your role in this household is Viewer. Categories, alerts and
              data management are handled by the household owner and editors;
              the preferences above only change how the app renders for you.
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
          timezone={prefs.timezone}
          currency={prefs.currency}
          locale={prefs.locale}
          language={prefs.language}
        />

        <PlanningForm
          lowBalanceThreshold={Number(user?.lowBalanceThreshold?.toString() ?? "0")}
          currency={prefs.currency}
        />

        <PushToggle subscribed={pushSubscribed} />

        <CategoryManager initialCategories={categories} />

        {people && (
          <MembersCard
            householdName={people.householdName}
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
