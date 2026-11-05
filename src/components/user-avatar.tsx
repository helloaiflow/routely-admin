"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getDisplayName, getInitials, type Person } from "@/lib/user-display";
import { cn } from "@/lib/utils";

/** M24: the one avatar for a person: initials from lib/user-display and the same primary fill in every place. Size and
 * corner radius come from className; the text size from textClassName. */
export function UserAvatar({
  person,
  imageUrl,
  className,
  textClassName = "text-xs",
}: {
  person: Person;
  imageUrl?: string | null;
  className?: string;
  textClassName?: string;
}) {
  return (
    <Avatar className={cn("size-8 rounded-lg", className)}>
      <AvatarImage
        src={imageUrl || undefined}
        alt={getDisplayName(person)}
        className="rounded-[inherit] object-cover"
      />
      <AvatarFallback
        className={cn("rounded-[inherit] bg-primary font-semibold text-primary-foreground", textClassName)}
      >
        {getInitials(person)}
      </AvatarFallback>
    </Avatar>
  );
}
