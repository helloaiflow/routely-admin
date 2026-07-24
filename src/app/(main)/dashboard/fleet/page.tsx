import Link from "next/link";

import { ArrowRight, Building2, Users } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

/** Fleet overview — a lightweight landing that routes to the dedicated
 *  Hubs and Drivers pages. Standalone (no data fetching). */
export default function FleetPage() {
  return (
    <div className="@container/main w-full space-y-6 px-4 py-4 sm:px-6">
      <div>
        <h1 className="font-semibold text-xl tracking-tight md:text-2xl">Fleet</h1>
        <p className="text-sm text-muted-foreground">
          Manage the depots your routes start from and the drivers who run them.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FleetCard
          href="/dashboard/hubs"
          icon={<Building2 className="size-5" aria-hidden="true" />}
          title="Hubs"
          description="Dispatch origins where routes begin and end."
        />
        <FleetCard
          href="/dashboard/drivers"
          icon={<Users className="size-5" aria-hidden="true" />}
          title="Drivers"
          description="The people who pick up and deliver packages."
        />
      </div>
    </div>
  );
}

function FleetCard({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link href={href} className="group block">
      <Card className="transition-colors hover:border-primary/40 hover:bg-muted/30">
        <CardContent className="flex items-center gap-4 p-5">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            {icon}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold">{title}</p>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          <ArrowRight
            className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
            aria-hidden="true"
          />
        </CardContent>
      </Card>
    </Link>
  );
}
