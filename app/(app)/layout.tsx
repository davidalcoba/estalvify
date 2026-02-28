// App shell layout — wraps all authenticated routes
// Provides sidebar + header. Redirects unauthenticated users to /login.

import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <SidebarProvider>
      <AppSidebar
        user={session.user}
        pendingCategorizations={0} // TODO: fetch real count from DB
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
