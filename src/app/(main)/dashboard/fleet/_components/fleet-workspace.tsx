"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { motion, useReducedMotion } from "framer-motion";
import { Building2, Plus, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { brandAlpha } from "@/lib/brand";
import { cn } from "@/lib/utils";

/* ── Premium isometric hero — center-column banner ─────────────────────────
 *  Mirrors the login hero language: an isometric mini-ecosystem image under a
 *  crisp Routely logo chip, a soft brand sheen (respecting reduced motion) and
 *  a from-card bottom gradient so the form below seats cleanly. Doubles as the
 *  empty-state when nothing is selected. The hero art may not exist on disk in
 *  dev — a broken image is acceptable there. */
export function FleetHero({
  variant,
  selectedLabel,
}: {
  variant: "hub" | "driver";
  selectedLabel: string | null;
}) {
  const reduced = useReducedMotion() ?? false;
  const isHub = variant === "hub";
  const src = isHub ? "/img/fleet-hub-hero.png" : "/img/fleet-driver-hero.png";
  const eyebrow = isHub ? "Fleet network" : "Last-mile delivery";
  const alt = isHub ? "Isometric Routely hub network" : "Isometric Routely delivery driver";
  const hint = isHub ? "Select a hub" : "Select a driver";

  return (
    <div className="relative h-[168px] overflow-hidden rounded-xl border bg-muted">
      <Image src={src} alt={alt} fill priority sizes="(min-width: 1280px) 40vw, 100vw" className="object-cover object-center" />

      {/* ambient brand sheen — a slow diagonal light sweep (Magic-UI beams feel) */}
      {!reduced && (
        <motion.div
          className="pointer-events-none absolute -inset-y-1/3 w-1/3 rotate-[18deg] blur-2xl"
          style={{ background: `linear-gradient(90deg, transparent, ${brandAlpha(0.16)}, transparent)` }}
          initial={{ left: "-40%" }}
          animate={{ left: "130%" }}
          transition={{ duration: 9, repeat: Number.POSITIVE_INFINITY, ease: "linear", repeatDelay: 2.5 }}
          aria-hidden="true"
        />
      )}

      {/* crisp Routely logo — soft blurred chip so branding stays legible on art */}
      <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-lg bg-white/70 px-2 py-1.5 shadow-sm backdrop-blur-md">
        {/* biome-ignore lint/a11y/useAltText: decorative brand mark with adjacent caption */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/img/routely.svg" alt="Routely" className="h-7 w-auto" />
      </div>

      {/* from-card bottom gradient — seats the form below with no hard seam */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-card via-card/70 to-transparent" />

      {/* caption band */}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between px-4 pb-3">
        <div className="min-w-0">
          <p className="type-label text-primary">{eyebrow}</p>
          <p className="type-body-sm mt-0.5 truncate font-medium text-foreground">{selectedLabel ?? hint}</p>
        </div>
        <span className="type-caption shrink-0 rounded-md bg-card/90 px-2 py-1 font-medium shadow-xs">Live operations</span>
      </div>
    </div>
  );
}

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
