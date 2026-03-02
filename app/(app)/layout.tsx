// App shell layout — wraps all authenticated routes
// Provides sidebar + header. Redirects unauthenticated users to /login.

import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const [pendingCategorizations] = await Promise.all([
    prisma.transaction.count({
      where: {
        userId: session.user.id,
        OR: [
          { categorization: null },
          { categorization: { status: "REJECTED" } },
        ],
      },
    }),
  ]);

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
        <AppHeader />
        <main className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
