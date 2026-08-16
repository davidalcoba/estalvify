"use client";

// Top header bar shown inside the app shell
// Contains sidebar trigger (mobile), breadcrumb, and quick actions

import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { usePageTitle } from "@/components/layout/page-title-context";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";
import { useT } from "@/components/i18n/i18n-provider";
import type { MessageKey } from "@/lib/i18n/dictionaries/en";

// Message keys, not labels — the map is module-level, the language is not.
const PAGE_TITLES: Record<string, MessageKey> = {
  "/dashboard": "nav.dashboard",
  "/categorize": "nav.categorize",
  "/insights": "nav.insights",
  "/rules": "nav.rules",
  "/plan": "nav.budget",
  "/transactions": "nav.transactions",
  // More specific route first — the matcher sorts by length, but keep it explicit.
  "/accounts/setup": "nav.connectBank",
  "/accounts": "nav.bankAccounts",
  "/reports": "nav.reports",
  "/recurring": "nav.recurring",
  "/forecast": "nav.forecast",
  "/settings": "nav.settings",
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
  const t = useT();
  // Null only outside the app shell, where nothing reports a page title; the
  // header then behaves as it always did and keeps its own.
  const collapsed = usePageTitle()?.collapsed ?? true;

  // Find the best matching title
  const key =
    Object.entries(PAGE_TITLES)
      .sort((a, b) => b[0].length - a[0].length)
      .find(([path]) => pathname.startsWith(path))?.[1];
  const title = t(key ?? "app.name");

  return (
    // The header is sticky at top-0, so with viewport-fit=cover it sits under
    // the status bar once installed. h-header-safe + pt-safe push the row clear
    // of it; both collapse to the plain h-14 in a browser tab.
    <header
      data-app-header
      className="sticky top-0 z-40 flex h-header-safe pt-safe shrink-0 items-center gap-2 border-b bg-background px-4"
    >
      <SidebarTrigger className="-ml-1" />
      {/* The page states its own name at the top; this one takes over as that
          heading scrolls under the header, so the two are never on screen at
          once. Kept mounted and faded rather than unmounted: the row must not
          reflow, and the swap is meant to be barely noticed.
          See components/layout/page-title-context.tsx. */}
      <div
        aria-hidden={!collapsed}
        className={cn(
          "flex min-w-0 items-center gap-2 transition-[opacity,transform] duration-200 ease-out",
          collapsed ? "opacity-100" : "-translate-x-1 opacity-0",
        )}
      >
        <Separator orientation="vertical" className="h-4" />
        <h1 className="truncate text-sm font-medium text-foreground">{title}</h1>
      </div>
      <div className="ml-auto flex items-center gap-1">
        {bell}
        <ThemeToggle />
      </div>
    </header>
  );
}
