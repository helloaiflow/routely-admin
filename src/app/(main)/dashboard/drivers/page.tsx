"use client";

import { useCallback, useEffect, useState } from "react";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Car, Check, Loader2, Mail, Phone, RefreshCw, Search, Warehouse, X, Zap } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-is-mobile";

interface Driver {
  _id: string;
  spoke_driver_id?: string;
  full_name?: string;
  email?: string;
  phone?: string;
  active?: boolean;
  depot_id?: string;
  depots?: string[];
  display_name?: string;
  synced_at?: string;
  created_at?: string;
}

// ── Avatar colors — unique per driver name, like route colors in scans ────────
const AC = [
  { bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe", glow: "rgba(59,130,246,0.15)" },
  { bg: "#f0fdf4", text: "#15803d", border: "#bbf7d0", glow: "rgba(34,197,94,0.15)" },
  { bg: "#faf5ff", text: "#7e22ce", border: "#e9d5ff", glow: "rgba(168,85,247,0.15)" },
  { bg: "#fffbeb", text: "#b45309", border: "#fde68a", glow: "rgba(245,158,11,0.15)" },
  { bg: "#fff1f2", text: "#be123c", border: "#fecdd3", glow: "rgba(244,63,94,0.15)" },
  { bg: "#f0fdfa", text: "#0f766e", border: "#99f6e4", glow: "rgba(20,184,166,0.15)" },
  { bg: "#fff7ed", text: "#c2410c", border: "#fed7aa", glow: "rgba(249,115,22,0.15)" },
  { bg: "#ecfeff", text: "#0e7490", border: "#a5f3fc", glow: "rgba(6,182,212,0.15)" },
];
const getAC = (n?: string) => AC[(n || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0) % AC.length];
const ini = (n?: string) =>
  n
    ? n
        .split(" ")
        .map((w) => w[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "?";
const DN: Record<string, string> = {
  "depots/RH4rD13JWv1BDHP1oLnP": "Hello AI, LLC",
  "depots/afVhthjmXoKistoTTnua": "AP Vision Labs",
  "depots/ppcmLgyRExaQu9utpZyI": "MCM - CENTRAL",
  "depots/fV5yop9VtIM1V1DSfmyR": "MedFlorida - Pharmacy",
};

// ── Sec/Row — identical to scans ─────────────────────────────────────────────
function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="mb-1.5 font-bold text-[10px] text-muted-foreground/60 uppercase tracking-widest">{title}</p>
      <div className="divide-y overflow-hidden rounded-xl border bg-muted/20">{children}</div>
    </section>
  );
}
function Row({ label, value, mono = false }: { label: string; value?: string | null; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span className="shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <span className={`max-w-[190px] truncate text-right font-medium text-[11px] ${mono ? "font-mono" : ""}`}>
        {value}
      </span>
    </div>
  );
}

// ── DriverCard — same visual language as ScanCard ────────────────────────────
function DriverCard({ driver, isSelected, onClick }: { driver: Driver; isSelected: boolean; onClick: () => void }) {
  const c = getAC(driver.full_name);
  const name = driver.full_name || "Unknown Driver";
  const contact = driver.phone || driver.email || "No contact info";
  const depots = driver.depots || (driver.depot_id ? [driver.depot_id] : []);
  const depotName = depots.length > 0 ? DN[depots[0]] || depots[0].replace("depots/", "").slice(0, 22) : null;
  const syncDate = driver.synced_at
    ? new Date(driver.synced_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2, boxShadow: "0 8px 24px rgba(0,0,0,0.10)" }}
      whileTap={{ scale: 0.98 }}
      className={`relative w-full rounded-xl border text-left transition-all duration-200 ${
        isSelected
          ? "border-primary/40 bg-primary/5 shadow-sm ring-1 ring-primary/20"
          : "border-border/60 bg-card hover:border-primary/25 hover:shadow-sm"
      }`}
    >
      <div className="px-3.5 py-3">
        {/* Top: avatar + name + sync date — mirrors scan: emoji + name + date */}
        <div className="mb-1.5 flex items-start gap-2.5">
          <div className="relative shrink-0">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full font-bold text-[11px]"
              style={{
                background: c.bg,
                color: c.text,
                border: `1px solid ${c.border}`,
                boxShadow: `0 0 8px ${c.glow}`,
              }}
            >
              {ini(name)}
            </div>
            <div
              className={`absolute -right-0.5 -bottom-0.5 h-2 w-2 rounded-full border-2 border-card ${driver.active !== false ? "bg-green-500" : "bg-gray-300"}`}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-xs">{name}</p>
            <p className="mt-0.5 font-mono text-[10px] text-muted-foreground truncate">{contact}</p>
          </div>
          {syncDate && <p className="shrink-0 font-medium text-[10px] text-muted-foreground">{syncDate}</p>}
        </div>
        {/* Middle: depot (mirrors scan address line) */}
        {depotName && (
          <p className="mb-1.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
            <Warehouse className="h-2.5 w-2.5 shrink-0 opacity-60" />
            {depotName}
            {depots.length > 1 ? ` +${depots.length - 1} more` : ""}
          </p>
        )}
        {/* Bottom: status badges (mirrors scan route badges) */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 font-bold text-[9px] ${driver.active !== false ? "border-green-200 bg-green-50 text-green-700" : "border-gray-200 bg-gray-50 text-gray-500"}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${driver.active !== false ? "bg-green-500" : "bg-gray-400"}`} />
            {driver.active !== false ? "Active" : "Inactive"}
          </span>
          {driver.spoke_driver_id && (
            <span className="inline-flex items-center gap-0.5 rounded-full border border-primary/20 bg-primary/5 px-1.5 py-0.5 font-bold text-[9px] text-primary">
              <Zap className="h-2.5 w-2.5" /> Spoke
            </span>
          )}
        </div>
      </div>
    </motion.button>
  );
}

// ── Detail Panel — same structure as scans DetailPanel ────────────────────────
function DetailPanel({ driver, onClose }: { driver: Driver; onClose: () => void }) {
  const c = getAC(driver.full_name);
  const depots = driver.depots || (driver.depot_id ? [driver.depot_id] : []);

  return (
    <motion.div
      key={driver._id}
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25 }}
      className="flex h-full flex-col overflow-hidden"
    >
      {/* Header — gradient background like scans */}
      <div
        className="flex items-start justify-between gap-2 border-b px-5 py-4"
        style={{ background: `linear-gradient(135deg, ${c.bg}, transparent)` }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted md:hidden"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl font-bold text-base"
            style={{
              background: c.bg,
              color: c.text,
              border: `1px solid ${c.border}`,
              boxShadow: `0 0 16px ${c.glow}`,
            }}
          >
            {ini(driver.full_name)}
          </div>
          <div className="min-w-0">
            <p className="truncate font-bold text-base leading-tight">{driver.full_name || "Unknown"}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span
                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-semibold text-[10px] ${driver.active !== false ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}
              >
                <div
                  className={`h-1.5 w-1.5 rounded-full ${driver.active !== false ? "bg-green-500" : "bg-gray-300"}`}
                />
                {driver.active !== false ? "Active" : "Inactive"}
              </span>
              {driver.spoke_driver_id && (
                <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 font-semibold text-[10px] text-primary">
                  <Zap className="h-2.5 w-2.5" /> Spoke synced
                </span>
              )}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted md:flex"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Body — Sec/Row pattern identical to scans */}
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <Sec title="Contact">
          <Row label="Phone" value={driver.phone} mono />
          <Row label="Email" value={driver.email} />
        </Sec>
        {depots.length > 0 && (
          <Sec title="Depots">
            {depots.map((dep, i) => (
              <Row key={dep} label={`Depot ${i + 1}`} value={DN[dep] || dep.replace("depots/", "")} />
            ))}
          </Sec>
        )}
        <Sec title="Spoke">
          <Row label="Spoke ID" value={driver.spoke_driver_id?.replace("drivers/", "")} mono />
          <Row
            label="Last synced"
            value={
              driver.synced_at
                ? new Date(driver.synced_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "2-digit",
                  })
                : undefined
            }
          />
        </Sec>
        <Sec title="Status">
          <div className="flex items-center justify-between px-3 py-2.5">
            <span className="text-[11px] text-muted-foreground">Delivery status</span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-semibold text-[10px] ${driver.active !== false ? "border-green-200 bg-green-50 text-green-700" : "border-border bg-muted text-muted-foreground"}`}
            >
              <Check className="h-2.5 w-2.5" />
              {driver.active !== false ? "Active" : "Inactive"}
            </span>
          </div>
        </Sec>
      </div>

      {/* Footer — same style as scans */}
      <div className="flex flex-col gap-2 border-t bg-muted/10 px-5 py-3">
        {driver.phone && (
          <a
            href={`tel:${driver.phone}`}
            className="flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-blue-200/80 bg-blue-50/60 font-semibold text-blue-700 text-xs backdrop-blur-sm transition-all hover:bg-blue-100 hover:shadow-md"
          >
            <Phone className="h-3.5 w-3.5" /> Call Driver
          </a>
        )}
        {driver.email && (
          <a
            href={`mailto:${driver.email}`}
            className="flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-border bg-muted/30 font-semibold text-muted-foreground text-xs transition-all hover:bg-muted hover:text-foreground"
          >
            <Mail className="h-3.5 w-3.5" /> Send Email
          </a>
        )}
      </div>
    </motion.div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function DriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [selected, setSelected] = useState<Driver | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("active");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const isMobile = useIsMobile();

  const fetchDrivers = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/data/spoke-drivers?limit=200");
      if (res.ok) {
        const d = await res.json();
        setDrivers(d.list || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setSyncing(true);
      try {
        await fetch("/api/spoke/sync-drivers", { method: "POST" });
      } catch {
        /* silent */
      }
      setSyncing(false);
      await fetchDrivers(false);
    })();
  }, [fetchDrivers]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncMsg("");
    try {
      const res = await fetch("/api/spoke/sync-drivers", { method: "POST" });
      const d = await res.json();
      setSyncMsg(`${d.added || 0} added · ${d.updated || 0} updated`);
      await fetchDrivers(true);
      setTimeout(() => setSyncMsg(""), 3000);
    } catch {
      setSyncMsg("Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const sorted = [...drivers].sort((a, b) => {
    const aA = a.active !== false ? 0 : 1,
      bA = b.active !== false ? 0 : 1;
    if (aA !== bA) return aA - bA;
    return (a.full_name || "").localeCompare(b.full_name || "");
  });
  const filtered = sorted.filter((d) => {
    const ms =
      !search ||
      (d.full_name || "").toLowerCase().includes(search.toLowerCase()) ||
      (d.email || "").toLowerCase().includes(search.toLowerCase()) ||
      (d.phone || "").includes(search);
    const mf =
      statusFilter === "all" ||
      (statusFilter === "active" && d.active !== false) ||
      (statusFilter === "inactive" && d.active === false);
    return ms && mf;
  });
  const activeCount = drivers.filter((d) => d.active !== false).length;
  const inactiveCount = drivers.filter((d) => d.active === false).length;
  const linkedCount = drivers.filter((d) => d.spoke_driver_id).length;

  if (loading)
    return (
      <div className="flex h-[calc(100vh-8rem)] gap-3">
        <div className="w-[360px] shrink-0 space-y-2 p-3">
          {["a", "b", "c", "d", "e", "f"].map((k, i) => (
            <Skeleton key={k} className="rounded-xl" style={{ height: 88, opacity: 1 - i * 0.13 }} />
          ))}
        </div>
        <Skeleton className="flex-1 rounded-xl" />
      </div>
    );

  // Summary pills — same pattern as scans
  const pills = [
    { k: "all", e: "👥", v: drivers.length, c: "bg-slate-100 text-slate-700 ring-slate-200" },
    { k: "active", e: "✅", v: activeCount, c: "bg-green-100 text-green-700 ring-green-200" },
    { k: "inactive", e: "⏸️", v: inactiveCount, c: "bg-amber-100 text-amber-700 ring-amber-200" },
    { k: "_synced", e: "⚡", v: linkedCount, c: "bg-primary/10 text-primary ring-primary/20" },
  ];

  return (
    <div
      className="h-[calc(100vh-5rem)] overflow-hidden rounded-xl border bg-background shadow-sm"
      style={
        isMobile
          ? { display: "flex", flexDirection: "column" }
          : { display: "grid", gridTemplateColumns: "clamp(280px, 30vw, 340px) 1fr", gridTemplateRows: "1fr" }
      }
    >
      {/* COL 1 — List */}
      <div className={`flex min-w-0 flex-col overflow-hidden border-r ${selected && isMobile ? "hidden" : ""}`}>
        {/* Header — exact scans pattern: space-y-2 border-b bg-muted/10 px-3.5 py-3 */}
        <div className="space-y-2 border-b bg-muted/10 px-3.5 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-bold text-sm">🚗 Spoke Drivers</h1>
              <p className="text-[10px] text-muted-foreground">
                {filtered.length} of {drivers.length}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <motion.button
                whileTap={{ rotate: 180 }}
                type="button"
                onClick={() => fetchDrivers(true)}
                disabled={loading}
                className="flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <RefreshCw className="h-3 w-3" />
              </motion.button>
              <button
                type="button"
                onClick={handleSync}
                disabled={syncing}
                className="flex h-6 items-center gap-1 rounded-lg bg-primary/10 px-2 font-semibold text-[10px] text-primary hover:bg-primary/20 disabled:opacity-50"
              >
                {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}Sync
              </button>
            </div>
          </div>
          {syncMsg && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-lg bg-green-50 px-2.5 py-1 font-medium text-[10px] text-green-700"
            >
              ✓ {syncMsg}
            </motion.div>
          )}
          <div className="relative">
            <Search className="absolute top-1/2 left-2.5 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search drivers..."
              className="h-7 pr-7 pl-8 text-xs"
            />
            <AnimatePresence>
              {search && (
                <motion.button
                  type="button"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  onClick={() => setSearch("")}
                  className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </motion.button>
              )}
            </AnimatePresence>
          </div>
          <div className="flex gap-1">
            {(["all", "active", "inactive"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`flex-1 rounded-lg border py-1 font-semibold text-[10px] capitalize transition-all ${
                  statusFilter === s
                    ? s === "active"
                      ? "border-green-200 bg-green-50 text-green-700"
                      : s === "inactive"
                        ? "border-amber-200 bg-amber-50 text-amber-700"
                        : "border-primary/30 bg-primary/5 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Summary pills — flex gap-1.5 overflow-x-auto border-b bg-muted/5 px-3 py-2 */}
        <div className="flex gap-1.5 overflow-x-auto border-b bg-muted/5 px-3 py-2">
          {pills.map((p) => (
            <motion.button
              key={p.k}
              type="button"
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => !p.k.startsWith("_") && setStatusFilter(p.k as "all" | "active" | "inactive")}
              className={`flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 font-bold text-[10px] ring-1 transition-all ${p.c} ${statusFilter === p.k ? "scale-105 shadow-sm ring-2" : "opacity-70 hover:opacity-100"}`}
            >
              {p.e} {p.v}
            </motion.button>
          ))}
        </div>

        {/* Cards list — flex-1 space-y-1.5 overflow-y-auto p-2.5 */}
        <div className="flex-1 space-y-1.5 overflow-y-auto p-2.5">
          {drivers.length === 0 ? (
            <div className="flex flex-col items-center gap-3 pt-16 text-muted-foreground">
              <Car className="h-12 w-12 opacity-10" />
              <div className="text-center">
                <p className="font-semibold text-sm">No drivers synced yet</p>
                <p className="mt-0.5 text-xs opacity-60">Click ⚡ Sync to import from Spoke</p>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 pt-16 text-muted-foreground">
              <Car className="h-10 w-10 opacity-10" />
              <p className="text-sm">No results found</p>
            </div>
          ) : (
            filtered.map((d) => (
              <DriverCard key={d._id} driver={d} isSelected={selected?._id === d._id} onClick={() => setSelected(d)} />
            ))
          )}
        </div>
      </div>

      {/* COL 2 — Detail (desktop) */}
      <div className="hidden flex-col overflow-hidden md:flex">
        {!selected ? (
          <div className="flex h-full flex-col items-center justify-center gap-5 text-muted-foreground">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50">
              <Car className="h-7 w-7 opacity-25" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-foreground text-sm">Select a driver</p>
              <p className="mt-1 text-xs opacity-55">Details will appear here</p>
            </div>
            <div className="grid w-full max-w-sm grid-cols-3 gap-2 px-8">
              {[
                { v: drivers.length, l: "Total", c: "text-foreground" },
                { v: activeCount, l: "Active", c: "text-green-600" },
                { v: linkedCount, l: "Synced", c: "text-primary" },
              ].map((s) => (
                <div key={s.l} className="rounded-xl border bg-card px-3 py-2.5 text-center shadow-sm">
                  <p className={`font-bold text-lg ${s.c}`}>{s.v}</p>
                  <p className="text-[10px] text-muted-foreground">{s.l}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <DetailPanel driver={selected} onClose={() => setSelected(null)} />
        )}
      </div>

      {/* Mobile full-screen overlay — same as scans */}
      {selected && isMobile && (
        <div
          className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-background"
          style={{ animation: "slideUp 0.2s ease-out" }}
        >
          <DetailPanel driver={selected} onClose={() => setSelected(null)} />
        </div>
      )}
    </div>
  );
}
