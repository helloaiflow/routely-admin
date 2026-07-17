"use client";

import Link from "next/link";

import { useUser } from "@clerk/nextjs";
import { useShallow } from "zustand/react/shallow";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { usePagePermissions } from "@/hooks/use-page-permissions";
import { type NavGroup, sidebarItems } from "@/navigation/sidebar/sidebar-items";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

import { NavMain } from "./nav-main";
import { NavUser } from "./nav-user";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user } = useUser();
  // Member-system Phase 4: members only see the pages their owner granted.
  // Owners resolve to full access with no fetch. UI-only — APIs enforce too.
  const { isMember, permissions } = usePagePermissions();
  const visibleItems: NavGroup[] = !isMember
    ? sidebarItems
    : sidebarItems
        .map((group) => ({
          ...group,
          items: group.items
            .filter((item) => !item.permission || permissions[item.permission])
            .map((item) => ({
              ...item,
              subItems: item.subItems?.filter((s) => !s.permission || permissions[s.permission]),
            })),
        }))
        .filter((group) => group.items.length > 0);
  const { sidebarVariant, sidebarCollapsible, isSynced } = usePreferencesStore(
    useShallow((s) => ({
      sidebarVariant: s.sidebarVariant,
      sidebarCollapsible: s.sidebarCollapsible,
      isSynced: s.isSynced,
    })),
  );

  const variant = isSynced ? sidebarVariant : props.variant;
  const collapsible = isSynced ? sidebarCollapsible : props.collapsible;

  const companyName = (user?.publicMetadata?.companyName as string) || "";
  const fullName = user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() : "";
  const displayName = companyName || fullName || "User";
  const email = user?.emailAddresses?.[0]?.emailAddress || "";
  const initials = companyName
    ? companyName
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : ((user?.firstName?.[0] || "") + (user?.lastName?.[0] || "")).toUpperCase() || email[0]?.toUpperCase() || "R";

  const clerkUser = {
    name: displayName,
    email,
    avatar: user?.imageUrl || "",
    initials,
  };

  return (
    <Sidebar {...props} variant={variant} collapsible={collapsible}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="Routely">
              <Link
                prefetch={false}
                href="/dashboard/default"
                className="flex items-center py-0 group-data-[collapsible=icon]:justify-center"
              >
                {/* Expanded: full wordmark (mark + name), height-constrained */}
                <img
                  src="/img/routelyLogoBlack.svg"
                  alt="Routely"
                  className="h-10 w-auto dark:invert group-data-[collapsible=icon]:hidden"
                />
                {/* Collapsed: brand mark only, centered in the 32px icon button */}
                <img
                  src="/img/routely_favico_Blue.svg"
                  alt="Routely"
                  className="hidden size-7 group-data-[collapsible=icon]:block"
                />
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={visibleItems} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={clerkUser} />
      </SidebarFooter>
    </Sidebar>
  );
}
