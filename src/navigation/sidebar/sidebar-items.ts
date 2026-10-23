import {
  BarChart3,
  Bot,
  Box,
  Briefcase,
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
  ShieldCheck,
  Truck,
  UserCheck,
  Users,
  Wallet,
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
            title: "Providers",
            url: "/dashboard/providers",
            icon: Plug,
            permission: "settings",
          },
        ],
      },
    ],
  },

  // ── Drivers (R29: new top-level section, pulled out of Operations) ─────────
  {
    id: 4,
    label: "",
    items: [
      {
        title: "Drivers",
        url: "/dashboard/driver-applicants",
        icon: Users,
        defaultOpen: true,
        // Staff-only applicant/driver data as a section — see the `adminOnly`
        // doc comment above. The "Drivers" roster sub-item below keeps its own
        // existing `permission: "settings"` gate unchanged (same route, same
        // access as before this round) so no tenant who already used it loses
        // access; the 3 new items are staff-only by design, no existing page.
        subItems: [
          {
            title: "Applications",
            url: "/dashboard/driver-applicants",
            icon: UserCheck,
            // Same route + gate as the old "Driver Applicants" item (no link
            // broken) — just renamed/re-homed per R29.
            adminOnly: true,
          },
          {
            title: "Drivers",
            url: "/dashboard/drivers",
            icon: Users,
            permission: "settings",
          },
          {
            title: "Background checks",
            url: "/dashboard/driver-applicants/background-checks",
            icon: ShieldCheck,
            adminOnly: true,
            // No dedicated page spec exists yet (background-check review today
            // lives inside an Application's own detail panel) — comingSoon
            // until a standalone page is actually designed/built.
            comingSoon: true,
          },
          {
            title: "Payouts",
            url: "/dashboard/driver-applicants/payouts",
            icon: Wallet,
            adminOnly: true,
            comingSoon: true,
          },
          {
            title: "Job offers",
            url: "/dashboard/driver-applicants/job-offers",
            icon: Briefcase,
            adminOnly: true,
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
