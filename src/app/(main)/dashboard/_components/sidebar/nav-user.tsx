"use client";

import Link from "next/link";

import { useClerk } from "@clerk/nextjs";
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

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { cn } from "@/lib/utils";

export function NavUser({
  user,
}: {
  readonly user: {
    readonly name: string;
    readonly email: string;
    readonly avatar: string;
    readonly initials: string;
  };
}) {
  const { isMobile } = useSidebar();
  const { signOut } = useClerk();

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
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarImage src={user.avatar || undefined} alt={user.name} className="rounded-lg" />
                <AvatarFallback className="rounded-lg bg-primary font-semibold text-primary-foreground text-xs">
                  {user.initials}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate font-semibold text-xs">{user.name}</span>
                {/* Email must ALWAYS be fully visible — no truncate; wraps if needed. */}
                <span className="whitespace-nowrap text-[10px] tracking-tight text-muted-foreground leading-tight">{user.email}</span>
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
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage src={user.avatar || undefined} alt={user.name} className="rounded-lg" />
                  <AvatarFallback className="rounded-lg bg-primary font-semibold text-primary-foreground text-xs">
                    {user.initials}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-semibold text-xs">{user.name}</span>
                  <span className="whitespace-nowrap text-[10px] tracking-tight text-muted-foreground leading-tight">{user.email}</span>
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
                <Link href="/dashboard/settings?tab=billing">
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
                      <span className="ml-auto text-[10px] text-muted-foreground">Soon</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard/support">
                      <Terminal />
                      Terminal
                      <span className="ml-auto text-[10px] text-muted-foreground">Soon</span>
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
