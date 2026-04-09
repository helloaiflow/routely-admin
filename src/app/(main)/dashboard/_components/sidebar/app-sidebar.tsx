"use client";

import Link from "next/link";

import { ClipboardList, MapPin, Package, Star, UserPlus } from "lucide-react";
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
import { sidebarItems } from "@/navigation/sidebar/sidebar-items";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

import { NavMain } from "./nav-main";
import { NavUser } from "./nav-user";
import { SidebarSearch } from "./sidebar-search";

const QUICK_ACTIONS = [
  { label: "Create Stop", icon: MapPin, href: "/dashboard/stops?action=create", color: "text-blue-600" },
  { label: "Create Plan", icon: Star, href: "/dashboard/plans?action=create", color: "text-violet-600" },
  { label: "Scan Package", icon: Package, href: "/dashboard/scans", color: "text-green-600" },
  { label: "Add Lead", icon: UserPlus, href: "/dashboard/leads?action=create", color: "text-amber-600" },
  { label: "Add Driver", icon: ClipboardList, href: "/dashboard/drivers?action=create", color: "text-teal-600" },
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
                <div className="flex size-8 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground text-xs">
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
        <div className="group-data-[collapsible=icon]:hidden">
          <SidebarSearch />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={sidebarItems} quickActions={QUICK_ACTIONS} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
