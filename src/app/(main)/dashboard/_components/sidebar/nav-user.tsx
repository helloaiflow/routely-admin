"use client";

import Link from "next/link";

import { useClerk } from "@/lib/auth/client";
import {
  CircleUser,
  Code2,
  CreditCard,
  EllipsisVertical,
  LifeBuoy,
  LogOut,
  MessageSquareDot,
  ScanLine,
  ScanText,
  Terminal,
  Webhook,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { UserAvatar } from "@/components/user-avatar";
import { getDisplayName, type Person } from "@/lib/user-display";
import { cn } from "@/lib/utils";

export function NavUser({ person, avatar }: { readonly person: Person; readonly avatar: string }) {
  const { isMobile } = useSidebar();
  const { signOut } = useClerk();
  // M24: same name and initials as the header and Settings (lib/user-display).
  const name = getDisplayName(person);
  const email = person.email ?? "";

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className={cn(
                // Subtle elevated account card — soft border + gentle bg lift + shadow,
                // a touch stronger on hover. Dark-safe via tokens.
                "border border-border/60 bg-card/60 shadow-sm transition-colors hover:border-border/80 hover:bg-muted/40",
                "data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground",
                // Collapsed (icon-only) → drop the chrome so the lone avatar reads clean.
                "group-data-[collapsible=icon]:border-transparent group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:shadow-none",
              )}
            >
              <UserAvatar person={person} imageUrl={avatar} />
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate font-semibold text-xs" title={name}>
                  {name}
                </span>
                {/* Email must ALWAYS be fully visible — no truncate; wraps if needed. Without a name it is already the
                    line above (M24). */}
                {name !== email && (
                  <span className="whitespace-nowrap text-10 tracking-tight text-muted-foreground leading-tight">
                    {email}
                  </span>
                )}
              </div>
              <EllipsisVertical className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <UserAvatar person={person} imageUrl={avatar} />
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-semibold text-xs">{name}</span>
                  {name !== email && (
                    <span className="whitespace-nowrap text-10 tracking-tight text-muted-foreground leading-tight">
                      {email}
                    </span>
                  )}
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/settings">
                  <CircleUser />
                  Account Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/billing">
                  <CreditCard />
                  Billing
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/settings?tab=notifications">
                  <MessageSquareDot />
                  Notifications
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/support" className="group">
                  <LifeBuoy className="text-primary transition-transform duration-200 group-hover:rotate-12 group-hover:scale-110" />
                  Support
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Code2 />
                  Dev Tools
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard/ocr-monitor">
                      <ScanText />
                      OCR Scan
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard/ivy-monitor">
                      <ScanLine />
                      IVY Scan
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard/support">
                      <Webhook />
                      API
                      <span className="ml-auto text-10 text-muted-foreground">Soon</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard/support">
                      <Terminal />
                      Terminal
                      <span className="ml-auto text-10 text-muted-foreground">Soon</span>
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-rose-600 focus:text-rose-600"
              onClick={() => signOut().then(() => (window.location.href = "/login"))}
            >
              <LogOut />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
