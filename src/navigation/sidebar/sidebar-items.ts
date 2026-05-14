import {
  Activity,
  BookMarked,
  BookOpen,
  Bot,
  Building2,
  Car,
  Code2,
  FileSearch,
  Fingerprint,
  GitBranch,
  Home,
  KeyRound,
  LayoutDashboard,
  type LucideIcon,
  MapPin,
  MapPinned,
  Navigation,
  Package,
  PackageSearch,
  Plug,
  Route,
  ScanLine,
  Send,
  Settings2,
  Terminal,
  Users,
  Webhook,
  Wrench,
  Zap,
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
}

export const sidebarItems: NavGroup[] = [
  // ── 1. Overview ────────────────────────────────────────────────────────────
  {
    id: 1,
    label: "Overview",
    items: [
      { title: "Dashboard", url: "/dashboard/default", icon: LayoutDashboard },
      { title: "Activity", url: "/dashboard/activity", icon: Activity, comingSoon: true },
    ],
  },

  // ── 2. Scans & Packages ────────────────────────────────────────────────────
  {
    id: 2,
    label: "Scans & Packages",
    items: [
      { title: "Scan Logs", url: "/dashboard/scan-logs", icon: ScanLine, isNew: true },
      { title: "Package Scans", url: "/dashboard/scans", icon: Package },
      { title: "Package Search", url: "/dashboard/search", icon: PackageSearch },
    ],
  },

  // ── 3. Dispatch & Routes ───────────────────────────────────────────────────
  {
    id: 3,
    label: "Dispatch & Routes",
    items: [
      { title: "Spoke Stops", url: "/dashboard/stops", icon: MapPin },
      { title: "Routes", url: "/dashboard/routes", icon: Navigation, comingSoon: true },
      { title: "Spoke Plans", url: "/dashboard/plans", icon: Route },
      { title: "Spoke Depots", url: "/dashboard/depots", icon: Building2 },
      { title: "Drivers", url: "/dashboard/drivers", icon: Car },
    ],
  },

  // ── 4. CRM ─────────────────────────────────────────────────────────────────
  {
    id: 4,
    label: "CRM",
    items: [
      {
        title: "People",
        url: "/dashboard/recipients",
        icon: Users,
        subItems: [
          { title: "Recipients", url: "/dashboard/recipients", icon: Users },
          { title: "Clients", url: "/dashboard/clients", icon: Building2 },
          { title: "Drivers", url: "/dashboard/drivers", icon: Car },
        ],
      },
    ],
  },

  // ── 5. Locations & Config ──────────────────────────────────────────────────
  {
    id: 5,
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
      {
        title: "Account",
        url: "/dashboard/tenants",
        icon: Fingerprint,
        subItems: [{ title: "Tenants", url: "/dashboard/tenants", icon: Fingerprint }],
      },
    ],
  },

  // ── 6. AI Center ───────────────────────────────────────────────────────────
  {
    id: 6,
    label: "AI Center",
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
          { title: "Dictionary", url: "/dashboard/dictionary", icon: BookMarked },
        ],
      },
    ],
  },

  // ── 7. Dev Tools ───────────────────────────────────────────────────────────
  {
    id: 7,
    label: "Dev Tools",
    items: [
      {
        title: "API",
        url: "/dashboard/api-keys",
        icon: Code2,
        subItems: [
          { title: "API Keys", url: "/dashboard/api-keys", icon: KeyRound },
          { title: "Webhooks", url: "/dashboard/webhooks", icon: Webhook },
          { title: "API Logs", url: "/dashboard/api-logs", icon: FileSearch, comingSoon: true },
        ],
      },
      {
        title: "Bots & Automation",
        url: "/dashboard/bots",
        icon: Zap,
        subItems: [
          { title: "Scan Bot (IVY)", url: "/dashboard/bots/ivy", icon: ScanLine },
          { title: "Telegram Bots", url: "/dashboard/bots/telegram", icon: Send },
          { title: "n8n Workflows", url: "/dashboard/bots/workflows", icon: GitBranch },
        ],
      },
      {
        title: "Integrations",
        url: "/dashboard/integrations",
        icon: Plug,
        subItems: [
          { title: "Connected Apps", url: "/dashboard/integrations", icon: Plug },
          { title: "Spoke / Circuit", url: "/dashboard/integrations/spoke", icon: Route },
        ],
      },
      { title: "Console", url: "/dashboard/console", icon: Terminal, comingSoon: true },
    ],
  },

  // ── 8. System ──────────────────────────────────────────────────────────────
  {
    id: 8,
    label: "System",
    items: [{ title: "Settings", url: "/dashboard/settings", icon: Settings2, comingSoon: true }],
  },
];
