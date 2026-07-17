"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// Shadcn Button Group — borders between items, no filled pill
// Matches: https://ui.shadcn.com/docs/components/radix/button-group

interface ButtonGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

function ButtonGroup({ className, children, ...props }: ButtonGroupProps) {
  return (
    <div
      role="group"
      className={cn("inline-flex items-center", className)}
      {...props}
    >
      {children}
    </div>
  );
}

interface ButtonGroupItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

function ButtonGroupItem({ className, active, children, ...props }: ButtonGroupItemProps) {
  return (
    <button
      type="button"
      className={cn(
        // Base style — bordered, no rounded except first/last
        "relative inline-flex h-8 items-center justify-center border border-border bg-background px-3 text-sm font-medium transition-colors",
        "focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        // Collapse adjacent borders
        "-ml-px first:ml-0",
        // Round only the outer corners
        "first:rounded-l-lg last:rounded-r-lg",
        // Active state
        active
          ? "z-10 border-primary/40 bg-primary/5 text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export { ButtonGroup, ButtonGroupItem };
