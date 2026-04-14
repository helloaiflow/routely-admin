import {
  BookMarked,
  BookOpen,
  Bot,
  Building2,
  Car,
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
  Plug,
  Route,
  Search,
  Settings2,
  Users,
  Wrench,
} from "lucide-react";

export interface NavSubItem {
  title: string;
  url: string;
  icon?: LucideIcon;
  comingSoon?: boolean;
  newTab?: boolean;
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
  {
    id: 1,
    label: "Overview",
    items: [{ title: "Dashboard", url: "/dashboard/default", icon: LayoutDashboard }],
  },
  {
    id: 2,
    label: "Operations",
    items: [
      { title: "Package Scans", url: "/dashboard/scans", icon: Package },
      { title: "Package Search", url: "/dashboard/search", icon: Search },
      { title: "Spoke Stops", url: "/dashboard/stops", icon: MapPin },
      { title: "Routes", url: "/dashboard/routes", icon: Navigation, comingSoon: true },
      { title: "Spoke Depots", url: "/dashboard/depots", icon: Route },
      { title: "Spoke Drivers", url: "/dashboard/drivers", icon: Car },
      { title: "Spoke Plans", url: "/dashboard/plans", icon: Route },
    ],
  },
  {
    id: 3,
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
  {
    id: 5,
    label: "Management",
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
          { title: "Flows", url: "/dashboard/flows", icon: GitBranch },
          { title: "Knowledge Base", url: "/dashboard/knowledge", icon: BookOpen },
          { title: "Dictionary", url: "/dashboard/dictionary", icon: BookMarked },
        ],
      },
    ],
  },
  {
    id: 7,
    label: "System",
    items: [
      { title: "Integrations", url: "/dashboard/integrations", icon: Plug },
      { title: "Settings", url: "/dashboard/settings", icon: Settings2, comingSoon: true },
    ],
  },
];
