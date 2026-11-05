"use client";

import { useClerk, useUser } from "@/lib/auth/client";
import { BadgeCheck, Bell, CreditCard, LogOut } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/user-avatar";
import { getDisplayName, personOf } from "@/lib/user-display";

export function AccountSwitcher() {
  const { user } = useUser();
  const { signOut } = useClerk();
  // M24: name and initials from lib/user-display, the same as the sidebar card.
  const person = personOf(user);
  const name = getDisplayName(person);
  const email = person.email ?? "";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className="cursor-pointer rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <UserAvatar person={person} imageUrl={user?.imageUrl} className="size-9" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-56 rounded-lg" side="bottom" align="end" sideOffset={4}>
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
            <UserAvatar person={person} imageUrl={user?.imageUrl} />
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{name}</span>
              {name !== email && <span className="truncate text-muted-foreground text-xs">{email}</span>}
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem>
            <BadgeCheck />
            Account
          </DropdownMenuItem>
          <DropdownMenuItem>
            <CreditCard />
            Billing
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Bell />
            Notifications
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => signOut().then(() => (window.location.href = "/login"))}>
          <LogOut />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
