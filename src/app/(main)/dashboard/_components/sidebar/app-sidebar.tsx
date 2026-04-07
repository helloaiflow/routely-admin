"use client";

import Link from "next/link";

import {
  BookMarked,
  BookOpen,
  BookUser,
  Bot,
  Building,
  Building2,
  Car,
  ClipboardList,
  GitBranch,
  Hash,
  Home,
  KeyRound,
  LayoutDashboard,
  MapPin,
  MapPinned,
  MessageSquare,
  Navigation,
  Package,
  Phone,
  Plug,
  Radio,
  Search,
  Settings2,
  TrendingUp,
  UserPlus,
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
import { SidebarSearch } from "./sidebar-search";

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
      { title: "Package Search", url: "/dashboard/search", icon: Search },
      { title: "Stops", url: "/dashboard/stops", icon: MapPin },
      { title: "Routes", url: "/dashboard/routes", icon: Navigation },
    ],
  },
  {
    id: 3,
    label: "CRM",
    items: [
      { title: "Recipients", url: "/dashboard/recipients", icon: Users },
      { title: "Clients", url: "/dashboard/clients", icon: Building2 },
      { title: "Drivers", url: "/dashboard/drivers", icon: Car },
      { title: "Leads", url: "/dashboard/leads", icon: UserPlus },
      { title: "Driver Applications", url: "/dashboard/applications", icon: ClipboardList },
    ],
  },
  {
    id: 4,
    label: "Communication",
    items: [
      { title: "Calls", url: "/dashboard/calls", icon: Phone },
      { title: "Numbers", url: "/dashboard/numbers", icon: Hash },
      { title: "Chats", url: "/dashboard/chats", icon: MessageSquare },
      { title: "Channels", url: "/dashboard/channels", icon: Radio },
      { title: "Contacts", url: "/dashboard/contacts", icon: BookUser },
    ],
  },
  {
    id: 5,
    label: "Management",
    items: [
      { title: "Gate Codes", url: "/dashboard/gate-codes", icon: KeyRound },
      { title: "Drop-offs", url: "/dashboard/dropoffs", icon: Home },
      { title: "Address Fixes", url: "/dashboard/addr-fixes", icon: Wrench },
      { title: "Client Locations", url: "/dashboard/client-locations", icon: MapPinned },
      { title: "Tenants", url: "/dashboard/tenants", icon: Building },
    ],
  },
  {
    id: 6,
    label: "AI Center",
    items: [
      { title: "Agents", url: "/dashboard/agents", icon: Bot },
      { title: "Flows", url: "/dashboard/flows", icon: GitBranch },
      { title: "Knowledge Base", url: "/dashboard/knowledge", icon: BookOpen },
      { title: "Dictionary", url: "/dashboard/dictionary", icon: BookMarked },
    ],
  },
  {
    id: 7,
    label: "System",
    items: [
      { title: "Integrations", url: "/dashboard/integrations", icon: Plug },
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
        <SidebarSearch />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={sidebarItems} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
