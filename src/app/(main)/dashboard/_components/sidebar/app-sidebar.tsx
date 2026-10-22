"use client";

import { useEffect, useState } from "react";

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
import { type NavGroup, type SidebarPermission, sidebarItems } from "@/navigation/sidebar/sidebar-items";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

import { NavMain } from "./nav-main";
import { NavUser } from "./nav-user";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user } = useUser();
  // Member-system Phase 4: members only see the pages their owner granted.
  // Owners resolve to full access with no fetch. UI-only — APIs enforce too.
  const { isMember, permissions } = usePagePermissions();

  // `adminOnly` items (Routely-staff-only data, e.g. Driver Applicants) are a
  // SEPARATE, stricter gate than the tenant `permission` flags above: a tenant
  // owner (not a "member") skips the isMember branch entirely and would
  // otherwise see every item unconditionally, including staff-only ones. We
  // reuse /api/admin/tenants as the "am I staff" signal — it's the same
  // ctx.isAdmin check the header's TenantSelector already relies on to
  // self-hide for non-admins, so this isn't a new trust boundary, just a
  // second UI-only reader of the existing one. Fails closed: hidden until a
  // 200 confirms staff. Real enforcement is server-side on every API route
  // under those pages — this is UI hiding only.
  const [isStaff, setIsStaff] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/tenants")
      .then((r) => {
        if (!cancelled && r.ok) setIsStaff(true);
      })
      .catch(() => {
        /* fail closed — stay hidden */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const byPermission = (item: { permission?: SidebarPermission }) => !item.permission || permissions[item.permission];
  const byAdminOnly = (item: { adminOnly?: boolean }) => !item.adminOnly || isStaff;

  const visibleItems: NavGroup[] = sidebarItems
    .map((group) => ({
      ...group,
      items: group.items
        .filter((item) => byAdminOnly(item) && (!isMember || byPermission(item)))
        .map((item) => ({
          ...item,
          subItems: item.subItems?.filter((s) => byAdminOnly(s) && (!isMember || byPermission(s))),
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
