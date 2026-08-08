"use client";

// Main application sidebar using shadcn/ui Sidebar component
// Contains navigation, user info, and quick actions

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import {
  Bell,
  LayoutDashboard,
  Tag,
  PiggyBank,
  ArrowLeftRight,
  Building2,
  BarChart3,
  Settings,
  LogOut,
  Sparkles,
  X,
  ListFilter,
  Repeat,
  LineChart,
  Home,
  Check,
} from "lucide-react";
import { switchHousehold } from "@/app/(app)/actions";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Suspense } from "react";
import { PendingBadge } from "@/components/layout/pending-badge";
import { LogoMark } from "@/components/brand/logo";
import { useCanWrite } from "@/components/layout/role-provider";
import { useT } from "@/components/i18n/i18n-provider";
import type { MessageKey } from "@/lib/i18n/dictionaries/en";

// Work-queue routes: pure mutation surfaces a read-only member can't use.
// Their pages also render a read-only notice for VIEWER, so a deep link
// stays consistent with the hidden nav item.
const WRITE_ONLY_URLS = new Set(["/categorize", "/rules"]);

// Nav carries message KEYS, not labels: the array is module-level (it never
// changes) while the strings depend on the member's language, so the lookup
// happens at render.
const navItems: {
  label: MessageKey;
  items: { title: MessageKey; url: string; icon: typeof LayoutDashboard }[];
}[] = [
  {
    label: "nav.group.overview",
    items: [
      {
        title: "nav.dashboard",
        url: "/dashboard",
        icon: LayoutDashboard,
      },
      {
        title: "nav.categorize",
        url: "/categorize",
        icon: Tag,
      },
      {
        title: "nav.insights",
        url: "/insights",
        icon: Sparkles,
      },
      {
        title: "nav.rules",
        url: "/rules",
        icon: ListFilter,
      },
      {
        title: "nav.notifications",
        url: "/notifications",
        icon: Bell,
      },
    ],
  },
  {
    label: "nav.group.planning",
    items: [
      {
        title: "nav.budget",
        url: "/plan",
        icon: PiggyBank,
      },
      {
        title: "nav.recurring",
        url: "/recurring",
        icon: Repeat,
      },
      {
        title: "nav.upcoming",
        url: "/forecast",
        icon: LineChart,
      },
      {
        title: "nav.reports",
        url: "/reports",
        icon: BarChart3,
      },
    ],
  },
  {
    label: "nav.group.money",
    items: [
      {
        title: "nav.transactions",
        url: "/transactions",
        icon: ArrowLeftRight,
      },
      {
        title: "nav.accounts",
        url: "/accounts",
        icon: Building2,
      },
    ],
  },
];

interface AppSidebarProps {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  /** The member's households (oldest first) and which one is active. */
  households?: { id: string; name: string }[];
  activeHouseholdId?: string;
  /**
   * Outstanding-work counts, as promises the shell deliberately does not
   * await: the sidebar renders straight away and each badge fills in when its
   * query returns. See components/layout/pending-badge.tsx.
   */
  pendingCategorizations?: Promise<number>;
  recurringToReview?: Promise<number>;
  onSignOut: () => void;
}

export function AppSidebar({
  user,
  households = [],
  activeHouseholdId,
  pendingCategorizations,
  recurringToReview,
  onSignOut,
}: AppSidebarProps) {
  const pathname = usePathname();
  const t = useT();
  const { isMobile, setOpenMobile } = useSidebar();
  const canWrite = useCanWrite();
  const [switching, startSwitching] = useTransition();

  // Outstanding work per route: transactions left to categorize, detected series
  // left to review. Rendered as a count badge on that nav item.
  const pendingByUrl: Record<string, Promise<number> | undefined> = {
    "/categorize": pendingCategorizations,
    "/recurring": recurringToReview,
  };

  const initials = user.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : user.email?.[0].toUpperCase() ?? "U";

  return (
    <Sidebar collapsible="icon">
      {/* ── Header ── */}
      <SidebarHeader>
        <div className="flex items-center gap-2">
          <SidebarMenu className="flex-1 min-w-0">
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <Link
                  href="/dashboard"
                  onClick={isMobile ? () => setOpenMobile(false) : undefined}
                >
                  <LogoMark />
                  <div className="flex flex-col gap-0.5 leading-none">
                    <span className="font-semibold tracking-tight">{t("app.name")}</span>
                    <span className="text-xs text-muted-foreground">{t("app.tagline")}</span>
                  </div>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          {isMobile && (
            <button
              onClick={() => setOpenMobile(false)}
              className="shrink-0 rounded-md p-2 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              <X className="size-5" />
              <span className="sr-only">{t("nav.closeMenu")}</span>
            </button>
          )}
        </div>
      </SidebarHeader>

      {/* ── Navigation ── */}
      <SidebarContent>
        {navItems.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{t(group.label)}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items
                  .filter((item) => canWrite || !WRITE_ONLY_URLS.has(item.url))
                  .map((item) => {
                  const isActive =
                    pathname === item.url ||
                    (item.url !== "/dashboard" && pathname.startsWith(item.url));
                  const pending = pendingByUrl[item.url];

                  const title = t(item.title);

                  return (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={title}
                        size={isMobile ? "lg" : "default"}
                        onClick={isMobile ? () => setOpenMobile(false) : undefined}
                      >
                        <Link href={item.url}>
                          <item.icon />
                          <span>{title}</span>
                          {pending && (
                            // No fallback: an empty slot that fills in beats a
                            // placeholder flashing where a badge may never go.
                            <Suspense fallback={null}>
                              <PendingBadge count={pending} />
                            </Suspense>
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      {/* ── Footer: user menu ── */}
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  id="user-menu-trigger"
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarImage src={user.image ?? undefined} alt={user.name ?? t("nav.user")} />
                    <AvatarFallback className="rounded-lg bg-brand/10 text-brand text-xs font-semibold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">{user.name ?? t("nav.user")}</span>
                    <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                  </div>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-56"
                side={isMobile ? "top" : "right"}
                align="end"
                sideOffset={4}
              >
                {/* Household switcher — only when there is a choice to make. */}
                {households.length > 1 && (
                  <>
                    {households.map((h) => {
                      const isActive = h.id === activeHouseholdId;
                      return (
                        <DropdownMenuItem
                          key={h.id}
                          disabled={switching || isActive}
                          onClick={() => startSwitching(() => switchHousehold(h.id))}
                        >
                          <Home className="mr-2 h-4 w-4" />
                          <span className="truncate">{h.name}</span>
                          {isActive && <Check className="ml-auto h-4 w-4" />}
                        </DropdownMenuItem>
                      );
                    })}
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem asChild>
                  <Link href="/settings">
                    <Settings className="mr-2 h-4 w-4" />
                    {t("nav.settings")}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onSignOut} className="text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  {t("nav.signOut")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
