"use client";

/* AvatarGroup — adapted from the shadcnblocks avatar-group patterns
 * (Tight Spacing with Borders + With Max Limit + With Tooltips), composed over
 * the existing shadcn avatar + tooltip primitives and our tokens.
 *   • overlapping circles (-space-x), ring on the background color
 *   • initials fallback on a deterministic per-name color (stable hue hash)
 *   • +N overflow chip past `max`
 *   • name tooltip on hover
 *   • `tone="blocked"` renders the red-tinted ring variant
 */

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type AvatarPerson = { id: string; name: string; imageUrl?: string | null };

/* Brand-anchored avatar spectrum: blues/indigos/violets/teals around the
 * Routely blue — deterministic per name, never a random rainbow. */
const BRAND_HUES = [217, 226, 240, 262, 205, 191, 172] as const;

/** Deterministic brand hue from a name — stable across renders and sessions. */
export function nameHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return BRAND_HUES[h % BRAND_HUES.length];
}

export function nameInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase() || "?";
}

export function PersonAvatar({
  person,
  size = "size-7",
  tone = "default",
  ring = true,
  className,
}: {
  person: AvatarPerson;
  size?: string;
  tone?: "default" | "blocked";
  ring?: boolean;
  className?: string;
}) {
  return (
    <Avatar
      className={cn(
        size,
        ring ? "ring-2" : "ring-1 ring-background",
        ring && (tone === "blocked" ? "ring-rose-500/60" : "ring-background"),
        className,
      )}
    >
      {person.imageUrl ? <AvatarImage src={person.imageUrl} alt={person.name} /> : null}
      <AvatarFallback
        className="text-10 font-semibold text-white"
        style={{
          background: `linear-gradient(135deg, hsl(${nameHue(person.name)} 72% 52% / 0.92), hsl(${nameHue(person.name)} 78% 40%))`,
        }}
      >
        {nameInitials(person.name)}
      </AvatarFallback>
    </Avatar>
  );
}

export function AvatarGroup({
  people,
  max = 6,
  tone = "default",
  size = "size-7",
  emptyText,
  className,
}: {
  people: AvatarPerson[];
  max?: number;
  tone?: "default" | "blocked";
  size?: string;
  emptyText?: string;
  className?: string;
}) {
  if (people.length === 0) {
    return emptyText ? <p className="py-0.5 type-caption">{emptyText}</p> : null;
  }
  const shown = people.slice(0, max);
  const overflow = people.length - shown.length;
  return (
    <div className={cn("flex items-center -space-x-2", className)}>
      {shown.map((p) => (
        <Tooltip key={p.id}>
          <TooltipTrigger asChild>
            <span className="rounded-full transition-transform hover:z-10 hover:-translate-y-0.5">
              <PersonAvatar person={p} size={size} tone={tone} />
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-11">
            {p.name}
          </TooltipContent>
        </Tooltip>
      ))}
      {overflow > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn(
                "z-10 grid place-items-center rounded-full bg-muted text-10 font-semibold text-muted-foreground ring-2",
                tone === "blocked" ? "ring-rose-500/60" : "ring-background",
                size,
              )}
            >
              +{overflow}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-11">
            {people.slice(max).map((p) => p.name).join(", ")}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
