// App shell layout — wraps all authenticated routes
// Provides sidebar + header. Redirects unauthenticated users to /login.

import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { toNotificationDTO } from "@/lib/notifications/notification-dto";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const userId = session.user.id;

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
        },
      }),
      prisma.notification.count({ where: { userId, readAt: null } }),
      // Cached — detection is too heavy to rerun on every navigation.
    ]);

  const notifications = notificationRows.map(toNotificationDTO);

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <SidebarProvider>
      <AppSidebar
        user={session.user}
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
  );
}
