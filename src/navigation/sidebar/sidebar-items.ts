import {
  BarChart3,
  Bot,
  BookOpen,
  Building2,
  Car,
  Code2,
  CreditCard,
  DollarSign,
  FileSearch,
  GitBranch,
  Home,
  KeyRound,
  Layers,
  LayoutDashboard,
  type LucideIcon,
  Map as MapIcon,
  MapPin,
  MapPinned,
  Navigation,
  Package,
  PackageSearch,
  Plug,
  Radio,
  Route,
  ScanLine,
  Send,
  Settings2,
  Terminal,
  Users,
  Warehouse,
  Webhook,
  Wrench,
} from "lucide-react";

export interface NavSubItem {
  title: string;
  url: string;
  icon?: LucideIcon;
  comingSoon?: boolean;
  newTab?: boolean;
  isNew?: boolean;
}

export interface NavMainItem {
  title: string;
  url: string;
  icon?: LucideIcon;
  subItems?: NavSubItem[];
  comingSoon?: boolean;
  newTab?: boolean;
  isNew?: boolean;
}

export interface NavGroup {
  id: number;
  label?: string;
  items: NavMainItem[];
  defaultOpen?: boolean; // whether this group section is expanded by default
}

// ─────────────────────────────────────────────────────────────────────────────
// Routely Admin — "control tower" for our OWNED logistics network.
// The nav is organized around the model we control (tenants, plans, depots,
// zones, drivers, routes, dispatch) — NOT around Spoke. Spoke lives under
// Dev Tools → Integrations as a temporary outbound sink we're phasing out.
// Pages that don't exist yet are marked `comingSoon` so they render without 404.
// ─────────────────────────────────────────────────────────────────────────────
export const sidebarItems: NavGroup[] = [
  // ── 1. Overview ────────────────────────────────────────────────────────────
  {
    id: 1,
    label: "Overview",
    defaultOpen: true,
    items: [
      { title: "Dashboard", url: "/dashboard/default", icon: LayoutDashboard },
      { title: "Live Map", url: "/dashboard/live-map", icon: MapIcon, comingSoon: true },
      { title: "Analytics", url: "/dashboard/analytics", icon: BarChart3 },
    ],
  },

  // ── 2. Operations ──────────────────────────────────────────────────────────
  {
    id: 2,
    label: "Operations",
    defaultOpen: true,
    items: [
      { title: "Stops", url: "/dashboard/stops", icon: MapPin },
      { title: "Dispatch", url: "/dashboard/dispatch", icon: Radio, comingSoon: true },
      { title: "Routes", url: "/dashboard/routes", icon: Navigation, comingSoon: true },
      { title: "Package Scans", url: "/dashboard/scans", icon: Package },
      { title: "Scan Logs", url: "/dashboard/scan-logs", icon: ScanLine },
      { title: "Search", url: "/dashboard/search", icon: PackageSearch },
    ],
  },

  // ── 3. Fleet ───────────────────────────────────────────────────────────────
  {
    id: 3,
    label: "Fleet",
    items: [
      { title: "Drivers", url: "/dashboard/drivers", icon: Car },
      { title: "Depots", url: "/dashboard/depots", icon: Warehouse },
      { title: "Zones", url: "/dashboard/zones", icon: MapPinned, comingSoon: true },
    ],
  },

  // ── 4. Customers ───────────────────────────────────────────────────────────
  {
    id: 4,
    label: "Customers",
    items: [
      { title: "Tenants", url: "/dashboard/tenants", icon: Building2 },
      { title: "Plans", url: "/dashboard/plans", icon: Layers },
      { title: "Recipients", url: "/dashboard/recipients", icon: Users },
    ],
  },

  // ── 5. Finance ─────────────────────────────────────────────────────────────
  {
    id: 5,
    label: "Finance",
    items: [
      { title: "Billing", url: "/dashboard/finance", icon: DollarSign },
      { title: "Payments", url: "/dashboard/payments", icon: CreditCard, comingSoon: true },
    ],
  },

  // ── 6. Locations & Config ──────────────────────────────────────────────────
  {
    id: 6,
    label: "Locations & Config",
    items: [
      {
        title: "Locations",
        url: "/dashboard/gate-codes",
        icon: MapPinned,
        subItems: [
          { title: "Gate Codes", url: "/dashboard/gate-codes", icon: KeyRound },
          { title: "Drop-offs", url: "/dashboard/dropoffs", icon: Home },
          { title: "Address Fixes", url: "/dashboard/addr-fixes", icon: Wrench },
          { title: "Client Locations", url: "/dashboard/client-locations", icon: MapPinned },
        ],
      },
    ],
  },

  // ── 7. AI & Automation ─────────────────────────────────────────────────────
  {
    id: 7,
    label: "AI & Automation",
    items: [
      {
        title: "AI Tools",
        url: "/dashboard/agents",
        icon: Bot,
        subItems: [
          { title: "Agents", url: "/dashboard/agents", icon: Bot },
          { title: "Virtual Office", url: "/dashboard/virtual-office", icon: Building2, isNew: true },
          { title: "Flows", url: "/dashboard/flows", icon: GitBranch },
          { title: "Knowledge Base", url: "/dashboard/knowledge", icon: BookOpen },
        ],
      },
    ],
  },

  // ── 8. Dev Tools ───────────────────────────────────────────────────────────
  {
    id: 8,
    label: "Dev Tools",
    items: [
      {
        title: "API",
        url: "/dashboard/api-keys",
        icon: Code2,
        subItems: [
          { title: "API Keys", url: "/dashboard/api-keys", icon: KeyRound, comingSoon: true },
          { title: "Webhooks", url: "/dashboard/webhooks", icon: Webhook, comingSoon: true },
          { title: "API Logs", url: "/dashboard/api-logs", icon: FileSearch, comingSoon: true },
        ],
      },
      {
        title: "Automation",
        url: "/dashboard/bots/ivy",
        icon: ScanLine,
        subItems: [
          { title: "Scan Bot (IVY)", url: "/dashboard/bots/ivy", icon: ScanLine, comingSoon: true },
          { title: "Telegram Bots", url: "/dashboard/bots/telegram", icon: Send, comingSoon: true },
          { title: "n8n Workflows", url: "/dashboard/bots/workflows", icon: GitBranch, comingSoon: true },
        ],
      },
      {
        title: "Integrations",
        url: "/dashboard/integrations",
        icon: Plug,
        subItems: [
          { title: "Connected Apps", url: "/dashboard/integrations", icon: Plug },
          { title: "Spoke / Circuit", url: "/dashboard/integrations/spoke", icon: Route, comingSoon: true },
        ],
      },
      { title: "Console", url: "/dashboard/console", icon: Terminal, comingSoon: true },
    ],
  },

  // ── 9. System ──────────────────────────────────────────────────────────────
  {
    id: 9,
    label: "System",
    items: [{ title: "Settings", url: "/dashboard/settings", icon: Settings2, comingSoon: true }],
  },
];
