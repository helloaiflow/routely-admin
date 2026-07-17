import Link from "next/link";

import { LifeBuoy } from "lucide-react";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * SidebarSupportCard
 * Support entry point in the sidebar footer. On mobile (the overlay drawer) it's
 * a compact, space-efficient "Support" button so it doesn't dominate the panel;
 * on desktop it's the fuller card (icon badge + title + description + action).
 * Both link to the same support page. The full card auto-hides when the desktop
 * sidebar collapses to icons.
 */
export function SidebarSupportCard() {
  return (
    <>
      {/* Mobile: compact pill — subtle, single line, leaves the drawer roomy. */}
      <Link
        href="/dashboard/support"
        className="flex h-9 items-center gap-2 rounded-lg border border-border/60 px-3 font-medium text-[13px] text-foreground transition-colors hover:bg-accent md:hidden"
      >
        <LifeBuoy className="size-4 shrink-0 text-primary" />
        Support
      </Link>

      {/* Desktop: fuller card (hidden on mobile, and when collapsed to icons). */}
      <Card size="sm" className="hidden shadow-none group-data-[collapsible=icon]:hidden md:block">
        <CardHeader className="px-4">
          <div className="mb-1 flex items-center gap-2">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <LifeBuoy className="size-3.5" />
            </span>
            <CardTitle className="text-sm">Need help?</CardTitle>
          </div>
          <CardDescription className="mb-2.5 text-xs leading-relaxed">
            Our team is here to help with anything you need.
          </CardDescription>
          <Link
            href="/dashboard/support"
            className="inline-flex h-7 w-full items-center justify-center rounded-md bg-primary font-medium text-primary-foreground text-xs transition-colors hover:bg-primary/90"
          >
            Contact support
          </Link>
        </CardHeader>
      </Card>
    </>
  );
}
