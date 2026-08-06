// App shell layout — wraps all authenticated routes
// Provides sidebar + header. Redirects unauthenticated users to /login.

import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { getScope } from "@/lib/auth/scope";
import { prisma } from "@/lib/prisma";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { RoleProvider } from "@/components/layout/role-provider";
import { toNotificationDTO } from "@/lib/notifications/notification-dto";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const scope = await getScope();

  if (!scope) {
    redirect("/login");
  }

  // Domain data (counts, notifications) is the household's; the sidebar
  // identity is the signed-in member's.
  const userId = scope.dataUserId;

  const [pendingCategorizations, notificationRows, unreadCount] =
    await Promise.all([
      prisma.transaction.count({
        where: {
          userId,
          OR: [
            { categorization: null },
            { categorization: { status: "REJECTED" } },
          ],
        },
      }),
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          type: true,
          severity: true,
          title: true,
          body: true,
          readAt: true,
          createdAt: true,
          // Read state is the ACTING member's, not the household's.
          reads: {
            where: { userId: scope.actorUserId },
            select: { id: true },
          },
        },
      }),
      prisma.notification.count({
        where: { userId, reads: { none: { userId: scope.actorUserId } } },
      }),
      // Cached — detection is too heavy to rerun on every navigation.
    ]);

  const notifications = notificationRows.map(toNotificationDTO);

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <RoleProvider role={scope.role}>
    <SidebarProvider>
      <AppSidebar
        user={scope.actor}
        pendingCategorizations={pendingCategorizations}
        onSignOut={handleSignOut}
      />
      <SidebarInset>
        <AppHeader notifications={notifications} unreadCount={unreadCount} />
        <main className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
    </RoleProvider>
  );
}
