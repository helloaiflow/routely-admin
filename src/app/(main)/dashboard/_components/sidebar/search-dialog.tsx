"use client";
import * as React from "react";

import { useRouter } from "next/navigation";

import {
  CircleUser,
  CreditCard,
  FileText,
  LayoutDashboard,
  type LucideIcon,
  MapPin,
  MessageSquareDot,
  Package,
  PlusCircle,
  ScanLine,
  ScanText,
  Search,
  Sparkles,
  Tag,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

/** Real Routely destinations — the ⌘J palette navigates the app (stops, orders,
 *  IVY/OCR, settings…). `keywords` widen fuzzy matching. */
type NavItem = { group: string; icon: LucideIcon; label: string; href: string; keywords?: string };

const NAV: NavItem[] = [
  { group: "Overview", icon: LayoutDashboard, label: "Dashboard", href: "/dashboard/default", keywords: "home stops today route" },

  { group: "Operations", icon: Search, label: "Search stops & orders", href: "/dashboard/search", keywords: "find lookup recipient tracking phone" },
  { group: "Operations", icon: Package, label: "Stops", href: "/dashboard/stops", keywords: "deliveries orders shipments" },
  { group: "Operations", icon: PlusCircle, label: "Buy a Label / New Order", href: "/dashboard/orders/new", keywords: "create shippo usps ups fedex" },
  { group: "Operations", icon: Tag, label: "Shipping Labels", href: "/dashboard/labels", keywords: "usps ups fedex purchased refund" },

  { group: "Dev Tools", icon: ScanText, label: "OCR Scan", href: "/dashboard/ocr-monitor", keywords: "qwen vision extraction latency" },
  { group: "Dev Tools", icon: ScanLine, label: "IVY Scan", href: "/dashboard/ivy-monitor", keywords: "ivy telegram dataentry pipeline failed" },

  { group: "Account", icon: CircleUser, label: "Account Settings", href: "/dashboard/settings", keywords: "profile avatar preferences" },
  { group: "Account", icon: CreditCard, label: "Billing", href: "/dashboard/settings?tab=billing", keywords: "payment invoice card charges" },
  { group: "Account", icon: Sparkles, label: "Plans", href: "/dashboard/settings?tab=plans", keywords: "upgrade subscription pricing" },
  { group: "Account", icon: MessageSquareDot, label: "Notifications", href: "/dashboard/settings?tab=notifications", keywords: "alerts email telegram" },
  { group: "Account", icon: MapPin, label: "Pickup Locations", href: "/dashboard/settings?tab=pickup", keywords: "pharmacy origin address" },
  { group: "Account", icon: FileText, label: "Invoices", href: "/dashboard/settings?tab=invoices", keywords: "receipt billing history" },
  { group: "Account", icon: Users, label: "Team", href: "/dashboard/settings?tab=team", keywords: "members invite users roles" },
];

export function SearchDialog() {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const groups = [...new Set(NAV.map((i) => i.group))];

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "j" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        variant="link"
        className="px-0! font-normal text-muted-foreground hover:no-underline"
      >
        <Search data-icon="inline-start" />
        Search
        <kbd className="inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-medium text-[10px]">
          <span className="text-xs">⌘</span>J
        </kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <Command>
          <CommandInput placeholder="Go to… stops, orders, IVY, OCR, settings" />
          <CommandList>
            <CommandEmpty>No matches.</CommandEmpty>
            {groups.map((group, index) => (
              <React.Fragment key={group}>
                {index > 0 && <CommandSeparator />}
                <CommandGroup heading={group}>
                  {NAV.filter((i) => i.group === group).map((item) => (
                    <CommandItem
                      key={item.href}
                      value={`${item.label} ${item.keywords ?? ""}`}
                      onSelect={() => go(item.href)}
                    >
                      <item.icon />
                      <span>{item.label}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </React.Fragment>
            ))}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
