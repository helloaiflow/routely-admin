import {
  BarChart3,
  Bot,
  Box,
  Building2,
  Layers,
  LayoutDashboard,
  type LucideIcon,
  MapPin,
  MessageCircle,
  Phone,
  Search,
  Truck,
} from "lucide-react";

/** Member-system Phase 4: which page permission an item needs. Items without
 *  a permission are visible to every active user of the tenant. */
export type SidebarPermission = "orders" | "billing" | "reports" | "settings";

export interface NavSubItem {
  title: string;
  url: string;
  icon?: LucideIcon;
  comingSoon?: boolean;
  newTab?: boolean;
  isNew?: boolean;
  permission?: SidebarPermission;
}

export interface NavMainItem {
  title: string;
  url: string;
  icon?: LucideIcon;
  subItems?: NavSubItem[];
  comingSoon?: boolean;
  newTab?: boolean;
  isNew?: boolean;
  defaultOpen?: boolean;
  permission?: SidebarPermission;
}

export interface NavGroup {
  id: number;
  label?: string;
  items: NavMainItem[];
}

export const sidebarItems: NavGroup[] = [
  // ── Overview ──────────────────────────────────────────────────────────────
  {
    id: 1,
    label: "Overview",
    items: [
      {
        title: "Dashboard",
        url: "/dashboard/default",
        icon: LayoutDashboard,
      },
      {
        title: "Analytics",
        url: "/dashboard/analytics",
        icon: BarChart3,
        permission: "reports",
        comingSoon: true,
      },
    ],
  },

  // ── Operations ────────────────────────────────────────────────────────────
  {
    id: 2,
    label: "",
    items: [
      {
        title: "Operations",
        url: "/dashboard/draft_order",
        icon: Layers,
        defaultOpen: true,
        permission: "orders",
        subItems: [
          {
            title: "Search",
            url: "/dashboard/search",
            icon: Search,
            permission: "orders",
          },
          {
            title: "Stops",
            url: "/dashboard/stops",
            icon: MapPin,
            permission: "orders",
          },
          {
            title: "Shipping Labels",
            url: "/dashboard/labels",
            icon: Box,
            permission: "orders",
          },
          {
            title: "Routes",
            url: "/dashboard/routes",
            icon: Truck,
            permission: "orders",
            comingSoon: true,
          },
        ],
      },
    ],
  },

  // ── Workspace (moved from the account menu) ────────────────────────────────
  {
    id: 3,
    label: "Workspace",
    items: [
      {
        title: "Virtual Office",
        url: "/dashboard/support",
        icon: Building2,
        subItems: [
          { title: "AI Agents", url: "/dashboard/support", icon: Bot, comingSoon: true },
          { title: "Call Center", url: "/dashboard/support", icon: Phone, comingSoon: true },
          { title: "Chats", url: "/dashboard/support", icon: MessageCircle, comingSoon: true },
        ],
      },
    ],
  },
];
