"use client";

// Top header bar shown inside the app shell
// Contains sidebar trigger (mobile), breadcrumb, and quick actions

import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { usePathname } from "next/navigation";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/categorize": "Categorize",
  "/insights": "Insights",
  "/rules": "Rules",
  "/plan": "Budget",
  "/transactions": "Transactions",
  // More specific route first — the matcher sorts by length, but keep it explicit.
  "/accounts/setup": "Connect Bank",
  "/accounts": "Bank Accounts",
  "/reports": "Reports",
  "/recurring": "Recurring",
  "/forecast": "Forecast",
  "/settings": "Settings",
};

export function AppHeader({
  bell,
}: {
  /**
   * The notification bell, rendered by the shell inside a Suspense boundary.
   * A slot rather than data: the two notification queries used to block the
   * whole layout, so nothing at all painted until they returned.
   */
  bell: React.ReactNode;
}) {
  const pathname = usePathname();

  // Find the best matching title
  const title =
    Object.entries(PAGE_TITLES)
      .sort((a, b) => b[0].length - a[0].length)
      .find(([path]) => pathname.startsWith(path))?.[1] ?? "Estalvify";

  return (
    // The header is sticky at top-0, so with viewport-fit=cover it sits under
    // the status bar once installed. h-header-safe + pt-safe push the row clear
    // of it; both collapse to the plain h-14 in a browser tab.
    <header className="sticky top-0 z-40 flex h-header-safe pt-safe shrink-0 items-center gap-2 border-b bg-background px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="h-4" />
      <h1 className="text-sm font-medium text-foreground">{title}</h1>
      <div className="ml-auto flex items-center gap-1">
        {bell}
        <ThemeToggle />
      </div>
    </header>
  );
}
