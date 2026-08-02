"use client";

// Main application sidebar using shadcn/ui Sidebar component
// Contains navigation, user info, and quick actions

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
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
} from "lucide-react";

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
import { Badge } from "@/components/ui/badge";

const navItems = [
  {
    label: "Overview",
    items: [
      {
        title: "Dashboard",
        url: "/dashboard",
        icon: LayoutDashboard,
      },
      {
        title: "Categorize",
        url: "/categorize",
        icon: Tag,
        // Badge count will come from props in the future
      },
      {
        title: "Insights",
        url: "/insights",
        icon: Sparkles,
      },
      {
        title: "Rules",
        url: "/rules",
        icon: ListFilter,
      },
    ],
  },
  {
    label: "Planning",
    items: [
      {
        title: "Plan",
        url: "/plan",
        icon: PiggyBank,
      },
      {
        title: "Recurring",
        url: "/recurring",
        icon: Repeat,
      },
      {
        title: "Forecast",
        url: "/forecast",
        icon: LineChart,
      },
      {
        title: "Reports",
        url: "/reports",
        icon: BarChart3,
      },
    ],
  },
  {
    label: "Money",
    items: [
      {
        title: "Transactions",
        url: "/transactions",
        icon: ArrowLeftRight,
      },
      {
        title: "Accounts",
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
  pendingCategorizations?: number;
  onSignOut: () => void;
}

export function AppSidebar({ user, pendingCategorizations = 0, onSignOut }: AppSidebarProps) {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();

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
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-brand text-brand-foreground">
                    <Sparkles className="size-4" />
                  </div>
                  <div className="flex flex-col gap-0.5 leading-none">
                    <span className="font-semibold">Estalvify</span>
                    <span className="text-xs text-muted-foreground">Personal Finance</span>
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
              <span className="sr-only">Close menu</span>
            </button>
          )}
        </div>
      </SidebarHeader>

      {/* ── Navigation ── */}
      <SidebarContent>
        {navItems.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const isActive =
                    pathname === item.url ||
                    (item.url !== "/dashboard" && pathname.startsWith(item.url));

                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={item.title}
                        size={isMobile ? "lg" : "default"}
                        onClick={isMobile ? () => setOpenMobile(false) : undefined}
                      >
                        <Link href={item.url}>
                          <item.icon />
                          <span>{item.title}</span>
                          {item.url === "/categorize" && pendingCategorizations > 0 && (
                            <Badge
                              variant="brand"
                              className="ml-auto h-5 min-w-5 px-1 text-xs"
                            >
                              {pendingCategorizations > 99 ? "99+" : pendingCategorizations}
                            </Badge>
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
                    <AvatarImage src={user.image ?? undefined} alt={user.name ?? "User"} />
                    <AvatarFallback className="rounded-lg bg-brand/10 text-brand text-xs font-semibold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">{user.name ?? "User"}</span>
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
                <DropdownMenuItem asChild>
                  <Link href="/settings">
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onSignOut} className="text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
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
