"use client";

import { useEffect, useState } from "react";

import { ChevronDown, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

type Suggestion = {
  id: number;
  suggested_limit_cents: number;
  current_limit_cents: number;
  inputs: {
    payment_punctuality_pct: number | null;
    invoices_considered: number;
    tenure_days: number;
    growth_pct_90d: number;
    multiplier_applied: number;
  };
};

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

/* Full-width strip (Section 8) — moved OUT of Credit & controls so the
 * suggestion doesn't compete with the numbers a staff member needs first
 * (a half-empty card most of the time, per the redesign brief). Collapsible
 * rather than Accordion: the header needs a title+badge on the left AND
 * Approve/Reject/chevron on the right in the SAME row, which Accordion's
 * single full-width trigger doesn't give room for. */
export function CreditRecommendationStrip() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);
  const [open, setOpen] = useState(true);

  function load() {
    fetch("/api/client/billing/credit-suggestions")
      .then((r) => r.json())
      .then((d) => setSuggestions(d.rows ?? []))
      .catch(() => {
        /* best-effort */
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function computeSuggestion() {
    setComputing(true);
    try {
      await fetch("/api/client/billing/credit-suggestions", { method: "POST" });
      load();
    } finally {
      setComputing(false);
    }
  }

  async function decide(id: number, approve: boolean) {
    await fetch(`/api/client/billing/credit-suggestions/${id}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approve }),
    });
    load();
  }

  if (loading) return null;

  if (suggestions.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-between gap-3 py-3">
          <p className="flex items-center gap-1.5 text-11 text-muted-foreground">
            <Sparkles className="size-3.5" /> No pending credit-limit suggestion — based on payment punctuality, tenure,
            and growth; an admin always approves before it applies.
          </p>
          <Button size="sm" variant="outline" onClick={computeSuggestion} disabled={computing} className="h-7 text-11">
            Compute
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {suggestions.map((s) => {
        const factors: Array<[string, string]> = [
          ["Proposed change", `${usd(s.current_limit_cents)} → ${usd(s.suggested_limit_cents)}`],
          ["Tenure (days)", String(s.inputs.tenure_days)],
          ["Growth (90d)", `${s.inputs.growth_pct_90d}%`],
          ["Multiplier applied", s.inputs.multiplier_applied.toFixed(2)],
          ["Invoices considered", String(s.inputs.invoices_considered)],
          [
            "Payment punctuality",
            s.inputs.payment_punctuality_pct == null ? "No history" : `${s.inputs.payment_punctuality_pct}%`,
          ],
        ];
        return (
          <Card key={s.id}>
            <CardContent className="py-3">
              <Collapsible open={open} onOpenChange={setOpen}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-3.5 text-primary" />
                    <span className="font-medium text-13">Credit-limit recommendation</span>
                    <Badge variant="outline" className="border-warning/40 text-10 text-warning">
                      Pending review
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" className="h-7 text-11" onClick={() => decide(s.id, true)}>
                      Approve
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-11" onClick={() => decide(s.id, false)}>
                      Reject
                    </Button>
                    <CollapsibleTrigger asChild>
                      <Button size="icon" variant="ghost" className="size-7">
                        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
                      </Button>
                    </CollapsibleTrigger>
                  </div>
                </div>
                <CollapsibleContent>
                  <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 border-border/60 border-t pt-3 text-11">
                    {factors.map(([label, value]) => (
                      <div key={label} className="flex flex-col gap-0.5">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-medium tabular-nums">{value}</span>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
