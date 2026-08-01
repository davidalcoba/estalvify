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
  "/rules": "Rules",
  "/budget": "Budget",
  "/transactions": "Transactions",
  // More specific route first — the matcher sorts by length, but keep it explicit.
  "/accounts/setup": "Connect Bank",
  "/accounts": "Bank Accounts",
  "/reports": "Reports",
  "/settings": "Settings",
};

export function AppHeader() {
  const pathname = usePathname();

  // Find the best matching title
  const title =
    Object.entries(PAGE_TITLES)
      .sort((a, b) => b[0].length - a[0].length)
      .find(([path]) => pathname.startsWith(path))?.[1] ?? "Estalvify";

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4 bg-background">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="h-4" />
      <h1 className="text-sm font-medium text-foreground">{title}</h1>
      <div className="ml-auto">
        <ThemeToggle />
      </div>
    </header>
  );
}
