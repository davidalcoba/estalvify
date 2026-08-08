// App shell layout — wraps all authenticated routes
// Provides sidebar + header. Redirects unauthenticated users to /login.
//
// Nothing here awaits domain data. The shell used to `await Promise.all` three
// queries before returning any markup, which meant opening the installed app on
// a cold start showed a blank screen until all of them came back — a route's
// own `loading.tsx` cannot help with that, because a route skeleton only
// appears once its *layout* has resolved.
//
// So the counts and the bell are handed down unawaited and suspend on their
// own: sidebar, header and the page's skeleton paint immediately, and each
// number drops in when its query returns. `getScope()` stays awaited because
// the shell cannot be drawn without it — it decides the redirect, the role and
// whose name is in the sidebar.

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { getScope } from "@/lib/auth/scope";
import { prisma } from "@/lib/prisma";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { NotificationBellData } from "@/components/layout/notification-bell-data";
import { RoleProvider } from "@/components/layout/role-provider";
import { InstallPrompt } from "@/components/layout/install-prompt";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const scope = await getScope();

  if (!scope) {
    redirect("/login");
  }

  // Domain data (counts, notifications) is the household's; the sidebar
  // identity is the signed-in member's.
  const userId = scope.dataUserId;

  // Deliberately not awaited — see the note at the top of the file.
  const pendingCategorizations = prisma.transaction.count({
    where: {
      userId,
      OR: [{ categorization: null }, { categorization: { status: "REJECTED" } }],
    },
  });

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <RoleProvider role={scope.role}>
      <SidebarProvider>
        <AppSidebar
          user={scope.actor}
          households={scope.households}
          activeHouseholdId={scope.householdId}
          pendingCategorizations={pendingCategorizations}
          onSignOut={handleSignOut}
        />
        <SidebarInset>
          <AppHeader
            bell={
              // No fallback: the bell is a small icon, and a placeholder
              // flashing in the header is more noticeable than its absence
              // for the moment the query takes.
              <Suspense fallback={null}>
                <NotificationBellData
                  dataUserId={userId}
                  actorUserId={scope.actorUserId}
                />
              </Suspense>
            }
          />
          {/* pb-safe-4 keeps the last row clear of the iOS home indicator once
              installed; it resolves to the normal p-4 in a browser tab. */}
          <main className="flex flex-1 flex-col gap-4 p-4 pb-safe-4 lg:p-6">
            {children}
          </main>
          <InstallPrompt />
        </SidebarInset>
      </SidebarProvider>
    </RoleProvider>
  );
}
