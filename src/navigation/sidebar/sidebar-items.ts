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
  PackageOpen,
  Phone,
  Plug,
  Search,
  Truck,
  UserCheck,
  Users,
  Warehouse,
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
  /** Routely-staff-only (CEO/routely_admin/dispatcher — ctx.isAdmin server-side),
   *  NEVER a tenant permission. `permission` above is a tenant's own page_permissions
   *  flag (any tenant owner, or any member their owner grants it to, gets it) — it
   *  is NOT staff-exclusive, so it must never be the only gate on staff-only data.
   *  Items with `adminOnly: true` are hidden from every non-admin regardless of
   *  `permission`/role, in addition to (not instead of) server-side enforcement on
   *  every API route the page calls. See app-sidebar.tsx for the client-side check
   *  and src/lib/tenant.ts `TenantContext.isAdmin` for the real, server-enforced gate. */
  adminOnly?: boolean;
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
  /** See NavSubItem.adminOnly — same staff-only gate, for a top-level item. */
  adminOnly?: boolean;
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
        url: "/dashboard/stops",
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
            title: "Internal Packages",
            url: "/dashboard/internal-packages",
            icon: PackageOpen,
            permission: "orders",
          },
          {
            title: "Routes",
            url: "/dashboard/routes",
            icon: Truck,
            permission: "orders",
            comingSoon: true,
          },
          {
            title: "Fleet",
            url: "/dashboard/fleet",
            icon: Warehouse,
            permission: "settings",
          },
          {
            title: "Hubs",
            url: "/dashboard/hubs",
            icon: Building2,
            permission: "settings",
          },
          {
            title: "Drivers",
            url: "/dashboard/drivers",
            icon: Users,
            permission: "settings",
          },
          {
            title: "Providers",
            url: "/dashboard/providers",
            icon: Plug,
            permission: "settings",
          },
          {
            title: "Driver Applicants",
            url: "/dashboard/driver-applicants",
            icon: UserCheck,
            // Staff-only applicant PII — see the `adminOnly` doc comment above.
            // No tenant `permission` here on purpose: there is no legitimate
            // tenant-facing version of this page to gate with "settings".
            adminOnly: true,
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
