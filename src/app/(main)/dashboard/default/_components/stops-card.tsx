"use client";

import { useMemo, useState } from "react";

import { ChevronDown, ChevronRight, Phone } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { statusLabel } from "./_helpers";
import type { DashboardStop } from "./_types";

// ── Types ──────────────────────────────────────────────────────────────────
type FilterKey = "signature" | "cod" | "cold" | "returns";

interface ColDef {
  key: string;
  label: string;
  render: (s: DashboardStop) => React.ReactNode;
  cls?: string; // extra td/th class (e.g. hide on small screens)
}

// ── Constants ──────────────────────────────────────────────────────────────
const FILTERS: { key: FilterKey; label: string; short: string; emptyMsg: string }[] = [
  { key: "signature", label: "Signature Required", short: "Signature", emptyMsg: "No signature-required stops today" },
  { key: "cod", label: "COD", short: "COD", emptyMsg: "No COD stops today" },
  { key: "cold", label: "Cold Package", short: "Cold", emptyMsg: "No cold-chain stops today" },
  { key: "returns", label: "Return to Tenant", short: "Returns", emptyMsg: "No return stops today" },
];

// ── Filter logic ───────────────────────────────────────────────────────────
function matchFilter(s: DashboardStop, k: FilterKey): boolean {
  switch (k) {
    case "signature":
      return !!s.requires_signature;
    case "cod":
      return !!s.collect_cod;
    case "cold":
      return ["cold", "cold_chain"].includes((s.package_type ?? "").toLowerCase());
    case "returns":
      return !!s.return_to_sender;
  }
}

// ── Shared cell helpers ────────────────────────────────────────────────────
const DELIVERED = ["delivered", "completed", "picked_up"];
const FAILED = ["failed", "attempted", "failed_not_home", "cancelled"];
const TRANSIT = ["in_transit", "out_for_delivery", "dispatched", "assigned"];

function badgeCls(status: string) {
  if (DELIVERED.includes(status))
    return "bg-emerald-50 text-emerald-700 ring-emerald-200/60 dark:bg-emerald-900/20 dark:text-emerald-400";
  if (TRANSIT.includes(status))
    return "bg-blue-50   text-blue-700   ring-blue-200/60   dark:bg-blue-900/20   dark:text-blue-400";
  if (FAILED.includes(status))
    return "bg-rose-50   text-rose-700   ring-rose-200/60   dark:bg-rose-900/20   dark:text-rose-400";
  return "bg-muted text-muted-foreground ring-border/50";
}

function fmtTime(v?: string | null) {
  if (!v) return "—";
  try {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  } catch {
    return "—";
  }
}

function fmtCurrency(n?: number | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);
}

const toTitle = (s: string) => (s ?? "").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

// ── Reusable cell components ───────────────────────────────────────────────
const CTracking = ({ s }: { s: DashboardStop }) => (
  <span className="font-mono font-semibold text-[11px] text-primary">{s.stop_id ?? s.id.slice(-8).toUpperCase()}</span>
);
const CRecipient = ({ s }: { s: DashboardStop }) => (
  <span className="whitespace-nowrap font-medium text-foreground text-xs">{toTitle(s.recipient_name || "—")}</span>
);
const CAddress = ({ s }: { s: DashboardStop }) => (
  <span className="block max-w-[160px] truncate text-muted-foreground text-xs">
    {[s.delivery_address, s.delivery_city].filter(Boolean).join(", ") || "—"}
  </span>
);
const CPhone = ({ s }: { s: DashboardStop }) => (
  <span className="whitespace-nowrap text-muted-foreground text-xs">{s.recipient_phone ?? "—"}</span>
);
const CEta = ({ s }: { s: DashboardStop }) => (
  <span className="whitespace-nowrap text-muted-foreground text-xs">
    {fmtTime(s.eta_at ?? s.eta ?? s.delivery_date)}
  </span>
);
const CDriver = ({ s }: { s: DashboardStop }) => (
  <span className="whitespace-nowrap text-muted-foreground text-xs">{s.driver_name ?? "—"}</span>
);
const CStatus = ({ s }: { s: DashboardStop }) => (
  <span
    className={cn(
      "inline-flex whitespace-nowrap rounded-full px-2 py-0.5 font-semibold text-[10px] ring-1",
      badgeCls(s.status),
    )}
  >
    {statusLabel(s.status)}
  </span>
);
const CCodAmt = ({ s }: { s: DashboardStop }) => (
  <span className="whitespace-nowrap font-semibold text-violet-600 text-xs dark:text-violet-400">
    {fmtCurrency(s.collect_amount)}
  </span>
);
const CPackType = ({ s }: { s: DashboardStop }) => (
  <span className="whitespace-nowrap text-muted-foreground text-xs">{s.package_type?.toUpperCase() ?? "—"}</span>
);
const CNotes = ({ s }: { s: DashboardStop }) => (
  <span className="block max-w-[140px] truncate text-muted-foreground text-xs">
    {(s.notes as string | undefined) ?? "—"}
  </span>
);

// ── Column sets ────────────────────────────────────────────────────────────
const COLS: Record<FilterKey, ColDef[]> = {
  // Signature: need phone + driver to coordinate hand-off
  signature: [
    { key: "track", label: "Tracking", render: (s) => <CTracking s={s} /> },
    { key: "recip", label: "Recipient", render: (s) => <CRecipient s={s} /> },
    { key: "addr", label: "Address", render: (s) => <CAddress s={s} />, cls: "hidden md:table-cell" },
    { key: "phone", label: "Phone", render: (s) => <CPhone s={s} />, cls: "hidden md:table-cell" },
    { key: "eta", label: "ETA", render: (s) => <CEta s={s} /> },
    { key: "driver", label: "Driver", render: (s) => <CDriver s={s} /> },
  ],
  // COD: amount + status is what dispatcher needs most
  cod: [
    { key: "track", label: "Tracking", render: (s) => <CTracking s={s} /> },
    { key: "recip", label: "Recipient", render: (s) => <CRecipient s={s} /> },
    { key: "addr", label: "Address", render: (s) => <CAddress s={s} />, cls: "hidden md:table-cell" },
    { key: "amount", label: "COD Amount", render: (s) => <CCodAmt s={s} /> },
    { key: "status", label: "Status", render: (s) => <CStatus s={s} /> },
    { key: "driver", label: "Driver", render: (s) => <CDriver s={s} />, cls: "hidden md:table-cell" },
  ],
  // Cold: type + ETA are critical for temperature compliance
  cold: [
    { key: "track", label: "Tracking", render: (s) => <CTracking s={s} /> },
    { key: "recip", label: "Recipient", render: (s) => <CRecipient s={s} /> },
    { key: "addr", label: "Address", render: (s) => <CAddress s={s} />, cls: "hidden md:table-cell" },
    { key: "type", label: "Pkg Type", render: (s) => <CPackType s={s} /> },
    { key: "eta", label: "ETA", render: (s) => <CEta s={s} /> },
    { key: "driver", label: "Driver", render: (s) => <CDriver s={s} />, cls: "hidden md:table-cell" },
  ],
  // Returns: status + notes explain why it's being returned
  returns: [
    { key: "track", label: "Tracking", render: (s) => <CTracking s={s} /> },
    { key: "recip", label: "Recipient", render: (s) => <CRecipient s={s} /> },
    { key: "addr", label: "Address", render: (s) => <CAddress s={s} />, cls: "hidden md:table-cell" },
    { key: "status", label: "Status", render: (s) => <CStatus s={s} /> },
    { key: "driver", label: "Driver", render: (s) => <CDriver s={s} />, cls: "hidden md:table-cell" },
    { key: "notes", label: "Notes", render: (s) => <CNotes s={s} /> },
  ],
};

const FILTER_EMOJI: Record<FilterKey, string> = {
  signature: "✍️",
  cod: "💵",
  cold: "❄️",
  returns: "↩️",
};

// ── Mobile row — tap to expand ─────────────────────────────────────────────
function MobileRow({ s, cols, emoji }: { s: DashboardStop; cols: ColDef[]; emoji: string }) {
  const [open, setOpen] = useState(false);
  // Cols after the first two (tracking + recipient) are "extra"
  const extraCols = cols.filter((c) => !["track", "recip"].includes(c.key));

  return (
    <div className="border-border/30 border-b last:border-0">
      {/* Always-visible summary */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/20"
      >
        <div className="min-w-0 flex-1 space-y-1">
          {/* Row 1: emoji + tracking + status */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-base leading-none">{emoji}</span>
              <CTracking s={s} />
            </div>
            <CStatus s={s} />
          </div>
          {/* Row 2: name + city */}
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-medium text-foreground text-xs">{toTitle(s.recipient_name || "—")}</span>
            <span className="shrink-0 text-[11px] text-muted-foreground">{s.delivery_city ?? ""}</span>
          </div>
        </div>
        <div className="mt-1 shrink-0 text-muted-foreground/40">
          {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </div>
      </button>

      {/* Expanded detail panel */}
      {open && (
        <div className="border-border/20 border-t bg-muted/10 px-4 pt-1 pb-3">
          <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-2.5">
            {extraCols.map((col) => (
              <div
                key={col.key}
                className={cn("flex flex-col gap-0.5", col.key === "addr" || col.key === "notes" ? "col-span-2" : "")}
              >
                <span className="font-semibold text-[10px] text-muted-foreground/50 uppercase leading-none tracking-wider">
                  {col.label}
                </span>
                <div>{col.render(s)}</div>
              </div>
            ))}
          </div>
          {/* Call CTA if phone available */}
          {s.recipient_phone && (
            <a
              href={`tel:${s.recipient_phone}`}
              className="mt-3 inline-flex items-center gap-1.5 font-medium text-[11px] text-primary"
            >
              <Phone className="size-3" />
              Call {s.recipient_phone}
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export function StopsCard({ stops, loading }: { stops: DashboardStop[]; loading: boolean }) {
  const [filter, setFilter] = useState<FilterKey>("signature");

  // Per-filter counts
  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = { signature: 0, cod: 0, cold: 0, returns: 0 };
    for (const s of stops) {
      if (matchFilter(s, "signature")) c.signature++;
      if (matchFilter(s, "cod")) c.cod++;
      if (matchFilter(s, "cold")) c.cold++;
      if (matchFilter(s, "returns")) c.returns++;
    }
    return c;
  }, [stops]);

  const filtered = useMemo(() => {
    return stops.filter((s) => matchFilter(s, filter)).slice(0, 50);
  }, [stops, filter]);

  const cols = COLS[filter];
  const activeTab = FILTERS.find((f) => f.key === filter)!;
  const totalCount = FILTERS.reduce((s, f) => s + counts[f.key], 0);

  if (loading)
    return (
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="font-semibold text-sm">Special Handling</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {["a", "b", "c", "d", "e"].map((k) => (
              <div key={k} className="h-10 animate-pulse rounded-lg bg-muted/50" />
            ))}
          </div>
        </CardContent>
      </Card>
    );

  return (
    <Card className="overflow-hidden border-border/60 shadow-sm">
      <CardHeader className="pb-0">
        <CardTitle className="font-semibold text-sm">Special Handling</CardTitle>
        <CardDescription className="text-xs">{totalCount} stops require special attention today</CardDescription>

        {/* Tab selector — pill group, left-aligned, compact */}
        <div className="col-span-full -mx-4 mt-3 border-border/40 border-t px-4 pt-3 pb-3">
          <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5 ring-1 ring-border/30">
            {FILTERS.map((f) => {
              const on = filter === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => {
                    setFilter(f.key);
                  }}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 font-medium text-[0.78rem] transition-all duration-150",
                    on
                      ? "bg-background text-foreground shadow-sm ring-1 ring-border/50"
                      : "text-muted-foreground/70 hover:bg-background/60 hover:text-foreground",
                  )}
                >
                  {f.short}
                  {counts[f.key] > 0 && (
                    <span
                      className={cn(
                        "min-w-[14px] text-center font-semibold text-[10px] tabular-nums leading-none",
                        on ? "text-primary" : "text-muted-foreground/55",
                      )}
                    >
                      {counts[f.key]}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {/* Desktop table */}
        <div className="hidden overflow-x-auto sm:block">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1.5 bg-muted/10 py-8">
              <p className="font-medium text-muted-foreground/60 text-xs">{activeTab.emptyMsg}</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-border/35 border-b bg-muted/15">
                  {cols.map((c) => (
                    <th
                      key={c.key}
                      className={cn(
                        "whitespace-nowrap px-4 py-2.5 text-left font-medium text-muted-foreground text-xs",
                        c.cls,
                      )}
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr
                    key={s.id}
                    className="border-border/25 border-b transition-colors last:border-0 hover:bg-muted/20"
                  >
                    {cols.map((c) => (
                      <td key={c.key} className={cn("px-4 py-2.5 align-middle", c.cls)}>
                        {c.render(s)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Mobile collapsible */}
        <div className="sm:hidden">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1.5 bg-muted/10 py-8">
              <p className="font-medium text-muted-foreground/60 text-xs">{activeTab.emptyMsg}</p>
            </div>
          ) : (
            filtered.map((s) => <MobileRow key={s.id} s={s} cols={cols} emoji={FILTER_EMOJI[filter]} />)
          )}
        </div>

        {/* Footer */}
        <div className="border-border/35 border-t bg-muted/10 px-4 py-2 text-[11px] text-muted-foreground/60">
          Showing {filtered.length} of {counts[filter]} {activeTab.label.toLowerCase()} stops
        </div>
      </CardContent>
    </Card>
  );
}
