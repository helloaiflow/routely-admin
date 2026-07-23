"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Building2, Plus, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function FleetWorkspace({
  title,
  description,
  entityLabel,
  onCreate,
  list,
  editor,
  insights,
}: {
  title: "Hubs" | "Drivers";
  description: string;
  entityLabel: string;
  onCreate: () => void;
  list: React.ReactNode;
  editor: React.ReactNode;
  insights: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <main className="flex min-h-full flex-col">
      <header className="flex flex-col gap-3 border-b bg-card px-4 py-3 lg:flex-row lg:items-center lg:justify-between lg:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            {title === "Hubs" ? (
              <Building2 className="size-4" aria-hidden="true" />
            ) : (
              <Users className="size-4" aria-hidden="true" />
            )}
          </span>
          <div className="min-w-0">
            <h1 className="type-page-title leading-none">{title}</h1>
            <p className="type-caption mt-1 truncate">{description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <nav className="flex rounded-lg bg-muted p-1" aria-label="Fleet workspaces">
            <Link
              href="/dashboard/hubs"
              className={cn(
                "type-body-sm inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 font-medium transition-colors",
                pathname === "/dashboard/hubs"
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Building2 className="size-3.5" aria-hidden="true" />
              Hubs
            </Link>
            <Link
              href="/dashboard/drivers"
              className={cn(
                "type-body-sm inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 font-medium transition-colors",
                pathname === "/dashboard/drivers"
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Users className="size-3.5" aria-hidden="true" />
              Drivers
            </Link>
          </nav>
          <Button size="sm" className="h-9" onClick={onCreate}>
            <Plus className="size-3.5" aria-hidden="true" />
            New {entityLabel}
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 bg-background xl:grid-cols-[270px_minmax(360px,0.92fr)_minmax(430px,1.08fr)]">
        <aside className="min-h-96 border-b bg-card xl:border-r xl:border-b-0">{list}</aside>
        <section className="min-h-96 border-b bg-card xl:border-r xl:border-b-0">{editor}</section>
        <aside className="min-h-96 bg-card">{insights}</aside>
      </div>
    </main>
  );
}
