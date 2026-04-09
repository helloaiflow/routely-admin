import {
  BarChart3,
  BookOpen,
  Bot,
  Building2,
  Car,
  FileText,
  Fingerprint,
  Globe,
  Hash,
  HeartPulse,
  LayoutDashboard,
  type LucideIcon,
  MapPin,
  MessageSquare,
  Package,
  Phone,
  Route,
  Search,
  Settings,
  Shield,
  Star,
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
  {
    id: 1,
    label: "Overview",
    items: [
      { title: "Dashboard", url: "/dashboard/default", icon: LayoutDashboard },
      { title: "Analytics", url: "/dashboard/analytics", icon: BarChart3 },
    ],
  },
  {
    id: 2,
    label: "Operations",
    items: [
      { title: "Package Scans", url: "/dashboard/scans", icon: Package },
      { title: "Package Search", url: "/dashboard/search", icon: Search },
      { title: "Stops", url: "/dashboard/stops", icon: MapPin },
      { title: "Routes", url: "/dashboard/routes", icon: Route, comingSoon: true },
    ],
  },
  {
    id: 3,
    label: "CRM",
    items: [
      { title: "Recipients", url: "/dashboard/recipients", icon: Users },
      { title: "Clients", url: "/dashboard/clients", icon: Building2 },
      { title: "Drivers", url: "/dashboard/drivers", icon: Car },
      { title: "Leads", url: "/dashboard/leads", icon: Star },
      { title: "Driver Applications", url: "/dashboard/applications", icon: FileText },
    ],
  },
  {
    id: 4,
    label: "Communication",
    items: [
      { title: "Calls", url: "/dashboard/calls", icon: Phone },
      { title: "Numbers", url: "/dashboard/numbers", icon: Hash },
      { title: "Chats", url: "/dashboard/chats", icon: MessageSquare, comingSoon: true },
      { title: "Channels", url: "/dashboard/channels", icon: Globe, comingSoon: true },
      { title: "Contacts", url: "/dashboard/contacts", icon: HeartPulse, comingSoon: true },
    ],
  },
  {
    id: 5,
    label: "Management",
    items: [
      { title: "Gate Codes", url: "/dashboard/gate-codes", icon: Shield },
      { title: "Drop-offs", url: "/dashboard/dropoffs", icon: MapPin },
      { title: "Address Fixes", url: "/dashboard/addr-fixes", icon: Wrench },
      { title: "Client Locations", url: "/dashboard/client-locations", icon: Building2 },
      { title: "Depots", url: "/dashboard/depots", icon: Route },
      { title: "Tenants", url: "/dashboard/tenants", icon: Fingerprint },
      { title: "Plans", url: "/dashboard/plans", icon: Star },
    ],
  },
  {
    id: 6,
    label: "AI Center",
    items: [
      { title: "Agents", url: "/dashboard/agents", icon: Bot },
      { title: "Flows", url: "/dashboard/flows", icon: Zap },
      { title: "Knowledge Base", url: "/dashboard/knowledge", icon: BookOpen },
      { title: "Dictionary", url: "/dashboard/dictionary", icon: FileText },
    ],
  },
  {
    id: 7,
    label: "System",
    items: [
      { title: "Integrations", url: "/dashboard/integrations", icon: Webhook },
      { title: "Settings", url: "/dashboard/settings", icon: Settings, comingSoon: true },
    ],
  },
];
