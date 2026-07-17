"use client";

import { Check, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import { PLANS } from "./settings-types";

export function PlansTab({ plan }: { plan: string }) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="type-section-title">Plans</h3>
        <p className="text-muted-foreground text-sm">Choose the plan that fits your delivery volume.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {PLANS.map((p) => {
          const isCurrent = p.id === plan;
          const isFeatured = p.id === "professional";
          return (
            <div
              key={p.id}
              className={cn(
                "group relative flex flex-col overflow-hidden rounded-2xl border p-5 shadow-xs ring-1 ring-foreground/10 transition-all",
                isCurrent
                  ? "border-primary bg-gradient-to-b from-primary/[0.07] to-card shadow-md ring-primary/25"
                  : "bg-card hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md",
              )}
            >
              {isFeatured && !isCurrent && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -top-12 -right-10 size-32 rounded-full bg-primary/10 blur-3xl"
                />
              )}
              {isCurrent && (
                <Badge className="absolute top-4 right-4 gap-1 bg-primary text-[10px] text-primary-foreground shadow-sm">
                  <Check className="size-3" aria-hidden="true" /> Current
                </Badge>
              )}
              {isFeatured && !isCurrent && (
                <Badge variant="outline" className="absolute top-4 right-4 gap-1 border-primary/30 text-[10px] text-primary">
                  <Sparkles className="size-3" aria-hidden="true" /> Popular
                </Badge>
              )}
              <p className="relative font-semibold text-base">{p.name}</p>
              <p className="relative mt-0.5 text-muted-foreground text-xs leading-relaxed">{p.desc}</p>
              <div className="relative mt-4 flex items-baseline gap-0.5">
                <span className="font-bold text-3xl tracking-tight">{p.price}</span>
                {p.unit && <span className="text-muted-foreground text-sm">{p.unit}</span>}
              </div>
              <Separator className="my-4" />
              <div className="relative flex-1 space-y-2">
                {p.features.map((f) => (
                  <div key={f} className="flex items-start gap-2 text-muted-foreground text-sm">
                    <Check
                      className={cn("mt-0.5 size-3.5 shrink-0", isCurrent ? "text-primary" : "text-muted-foreground/50")}
                      aria-hidden="true"
                    />
                    <span className="leading-tight">{f}</span>
                  </div>
                ))}
              </div>
              <Button
                size="sm"
                variant={isCurrent ? "default" : "outline"}
                disabled={isCurrent}
                className={cn(
                  "relative mt-5 h-9 w-full font-medium text-xs",
                  !isCurrent && "group-hover:bg-primary group-hover:text-primary-foreground",
                )}
              >
                {isCurrent ? "Current plan" : "Select plan"}
              </Button>
            </div>
          );
        })}
      </div>
      <p className="text-muted-foreground text-xs">
        All paid plans include a 14-day free trial. No credit card required to start. Changes take effect at the next
        billing cycle.
      </p>
    </div>
  );
}
