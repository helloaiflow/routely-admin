"use client";

import Link from "next/link";

import {
  Car,
  Home,
  KeyRound,
  LayoutDashboard,
  MapPin,
  Navigation,
  Package,
  Settings2,
  TrendingUp,
  Users,
  Wrench,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

import { NavMain } from "./nav-main";
import { NavUser } from "./nav-user";
import { SidebarSupportCard } from "./sidebar-support-card";

const sidebarItems = [
  {
    id: 1,
    label: "Overview",
    items: [
      { title: "Dashboard", url: "/dashboard/default", icon: LayoutDashboard },
      { title: "Analytics", url: "/dashboard/analytics", icon: TrendingUp },
    ],
  },
  {
    id: 2,
    label: "Operations",
    items: [
      { title: "Package Scans", url: "/dashboard/scans", icon: Package },
      { title: "Spoke Stops", url: "/dashboard/stops", icon: MapPin },
      { title: "Routes", url: "/dashboard/routes", icon: Navigation },
    ],
  },
  {
    id: 3,
    label: "Management",
    items: [
      { title: "Recipients", url: "/dashboard/recipients", icon: Users },
      { title: "Addr Fixes", url: "/dashboard/addr-fixes", icon: Wrench },
      { title: "Gate Codes", url: "/dashboard/gate-codes", icon: KeyRound },
      { title: "Drop-offs", url: "/dashboard/dropoffs", icon: Home },
    ],
  },
  {
    id: 4,
    label: "System",
    items: [
      { title: "Drivers", url: "/dashboard/drivers", icon: Car },
      { title: "Settings", url: "/dashboard/settings", icon: Settings2 },
    ],
  },
];

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { sidebarVariant, sidebarCollapsible, isSynced } = usePreferencesStore(
    useShallow((s) => ({
      sidebarVariant: s.sidebarVariant,
      sidebarCollapsible: s.sidebarCollapsible,
      isSynced: s.isSynced,
    })),
  );

  const variant = isSynced ? sidebarVariant : props.variant;
  const collapsible = isSynced ? sidebarCollapsible : props.collapsible;

  return (
    <Sidebar {...props} variant={variant} collapsible={collapsible}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link prefetch={false} href="/dashboard/default">
                <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-xs font-bold">
                  R
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="font-semibold text-base">Routely</span>
                  <span className="truncate text-muted-foreground text-xs">Operations Portal</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={sidebarItems} />
      </SidebarContent>
      <SidebarFooter>
        <SidebarSupportCard />
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
