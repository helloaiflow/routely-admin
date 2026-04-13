"use client";

import { useCallback, useEffect, useState } from "react";

import { AnimatePresence, motion } from "framer-motion";
import { Car, Check, Loader2, Mail, Phone, RefreshCw, Search, Warehouse, X, Zap } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

interface Driver {
  _id: string;
  spoke_driver_id?: string;
  full_name?: string;
  email?: string;
  phone?: string;
  active?: boolean;
  depot_id?: string;
  synced_at?: string;
  created_at?: string;
}

const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-green-100 text-green-700",
  "bg-violet-100 text-violet-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-teal-100 text-teal-700",
  "bg-orange-100 text-orange-700",
  "bg-cyan-100 text-cyan-700",
];
function avatarColor(name?: string) {
  const idx = (name || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_COLORS[idx % AVATAR_COLORS.length];
}
function initials(name?: string) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="mb-1.5 font-bold text-[10px] text-muted-foreground/50 uppercase tracking-widest">{title}</p>
      <div className="divide-y overflow-hidden rounded-xl border bg-muted/20">{children}</div>
    </section>
  );
}
function DRow({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value?: string; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5">
      <div className="flex shrink-0 items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-[11px]">{label}</span>
      </div>
      <span
        className={`max-w-[200px] truncate text-right font-medium text-[11px] ${mono ? "font-mono text-muted-foreground" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

export default function DriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [selected, setSelected] = useState<Driver | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");

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
    fetchDrivers();
  }, [fetchDrivers]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncMsg("");
    try {
      const res = await fetch("/api/spoke/sync-drivers", { method: "POST" });
      const d = await res.json();
      setSyncMsg(`${d.added || 0} added \u00B7 ${d.updated || 0} updated`);
      await fetchDrivers(true);
      setTimeout(() => setSyncMsg(""), 3000);
    } catch {
      setSyncMsg("Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const filtered = search
    ? drivers.filter(
        (d) =>
          (d.full_name || "").toLowerCase().includes(search.toLowerCase()) ||
          (d.email || "").toLowerCase().includes(search.toLowerCase()) ||
          (d.phone || "").includes(search),
      )
    : drivers;

  const activeCount = drivers.filter((d) => d.active !== false).length;
  const linkedCount = drivers.filter((d) => d.spoke_driver_id).length;

  return (
    <div
      className="h-[calc(100vh-5rem)] overflow-hidden rounded-xl border bg-background shadow-sm"
      style={{ display: "grid", gridTemplateColumns: "280px 1fr", gridTemplateRows: "1fr" }}
    >
      {/* COL 1 — List */}
      <div className="flex flex-col overflow-hidden border-r">
        <div className="border-b bg-muted/10 px-3.5 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-bold text-sm">Spoke Drivers</h1>
              <p className="text-[10px] text-muted-foreground">
                {activeCount} active \u00B7 {drivers.length} total
              </p>
            </div>
            <div className="flex items-center gap-1">
              <motion.button
                whileTap={{ rotate: 180 }}
                type="button"
                onClick={() => fetchDrivers(true)}
                disabled={loading}
                className="flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
              >
                <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
              </motion.button>
              <button
                type="button"
                onClick={handleSync}
                disabled={syncing}
                className="flex h-6 items-center gap-1 rounded-lg bg-primary/10 px-2 font-semibold text-[10px] text-primary hover:bg-primary/20 disabled:opacity-50"
              >
                {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                Sync Spoke
              </button>
            </div>
          </div>

          <div className="mt-2.5 grid grid-cols-3 divide-x rounded-xl border bg-background">
            <div className="px-2 py-1.5 text-center">
              <p className="font-bold text-foreground text-sm tabular-nums">{drivers.length}</p>
              <p className="font-semibold text-[8px] text-muted-foreground uppercase tracking-wide">Total</p>
            </div>
            <div className="px-2 py-1.5 text-center">
              <p className="font-bold text-green-600 text-sm tabular-nums">{activeCount}</p>
              <p className="font-semibold text-[8px] text-green-600 uppercase tracking-wide">Active</p>
            </div>
            <div className="px-2 py-1.5 text-center">
              <p className="font-bold text-primary text-sm tabular-nums">{linkedCount}</p>
              <p className="font-semibold text-[8px] text-primary uppercase tracking-wide">Synced</p>
            </div>
          </div>

          {syncMsg && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-2 rounded-lg bg-green-50 px-2.5 py-1 font-medium text-[10px] text-green-700"
            >
              {syncMsg}
            </motion.div>
          )}

          <div className="relative mt-2">
            <Search className="absolute top-1/2 left-2.5 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search drivers..."
              className="h-7 pr-7 pl-7 text-xs"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {loading ? (
            <div className="space-y-1.5 p-2">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-14 rounded-xl" style={{ opacity: 1 - i * 0.13 }} />
              ))}
            </div>
          ) : drivers.length === 0 ? (
            <div className="flex flex-col items-center gap-3 pt-12 text-muted-foreground">
              <Car className="h-10 w-10 opacity-15" />
              <div className="text-center">
                <p className="font-medium text-xs">No drivers synced yet</p>
                <p className="mt-0.5 text-[10px] opacity-60">Click Sync Spoke to import drivers</p>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 pt-12 text-muted-foreground">
              <Car className="h-8 w-8 opacity-15" />
              <p className="text-xs">No results</p>
            </div>
          ) : (
            filtered.map((driver) => {
              const name = driver.full_name || "Unknown";
              const isSel = selected?._id === driver._id;
              const cls = avatarColor(name);
              return (
                <button
                  key={driver._id}
                  type="button"
                  onClick={() => setSelected(driver)}
                  className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors ${isSel ? "border-primary border-r-[3px] bg-primary/5" : "hover:bg-muted/50"}`}
                >
                  <div
                    className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-bold text-xs ${cls}`}
                  >
                    {initials(name)}
                    <div
                      className={`absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-background ${driver.active !== false ? "bg-green-500" : "bg-gray-300"}`}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-medium text-xs">{name}</span>
                      {driver.spoke_driver_id && <Zap className="h-2.5 w-2.5 shrink-0 text-primary" />}
                    </div>
                    <p className="truncate text-[10px] text-muted-foreground">
                      {driver.email || driver.phone || "No contact"}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* COL 2 — Detail */}
      <div className="flex flex-col overflow-hidden">
        {!selected ? (
          <div className="flex h-full flex-col items-center justify-center gap-5 text-muted-foreground">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50">
              <Car className="h-7 w-7 opacity-25" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-foreground text-sm">Select a driver</p>
              <p className="mt-1 text-xs opacity-55">Spoke details will appear here</p>
            </div>
            <div className="grid w-full max-w-sm grid-cols-3 gap-2 px-8">
              {[
                { v: drivers.length, l: "Total", c: "text-foreground" },
                { v: activeCount, l: "Active", c: "text-green-600" },
                { v: linkedCount, l: "Synced", c: "text-primary" },
              ].map((s) => (
                <div key={s.l} className="rounded-xl border bg-card px-3 py-2.5 text-center">
                  <p className={`font-bold text-lg ${s.c}`}>{s.v}</p>
                  <p className="text-[10px] text-muted-foreground">{s.l}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={selected._id}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2 }}
              className="flex h-full flex-col overflow-hidden"
            >
              <div
                className="flex items-center gap-3 border-b px-5 py-4"
                style={{ background: "linear-gradient(135deg, hsl(var(--primary)/0.05), transparent)" }}
              >
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl font-bold text-base ${avatarColor(selected.full_name)}`}
                >
                  {initials(selected.full_name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-base leading-tight">{selected.full_name || "Unknown"}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span
                      className={`flex items-center gap-1 text-xs ${selected.active !== false ? "text-green-600" : "text-muted-foreground"}`}
                    >
                      <div
                        className={`h-1.5 w-1.5 rounded-full ${selected.active !== false ? "bg-green-500" : "bg-gray-300"}`}
                      />
                      {selected.active !== false ? "Active" : "Inactive"}
                    </span>
                    {selected.spoke_driver_id && (
                      <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-[9px] text-primary">
                        <Zap className="h-2.5 w-2.5" /> Spoke synced
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
                <Sec title="Contact">
                  <DRow icon={<Phone className="h-3.5 w-3.5" />} label="Phone" value={selected.phone} mono />
                  <DRow icon={<Mail className="h-3.5 w-3.5" />} label="Email" value={selected.email} />
                </Sec>

                {selected.depot_id && (
                  <Sec title="Assignment">
                    <DRow
                      icon={<Warehouse className="h-3.5 w-3.5" />}
                      label="Depot"
                      value={selected.depot_id.replace("depots/", "").slice(0, 16)}
                      mono
                    />
                  </Sec>
                )}

                <Sec title="Spoke">
                  <DRow
                    icon={<Zap className="h-3.5 w-3.5" />}
                    label="Spoke ID"
                    value={selected.spoke_driver_id?.replace("drivers/", "")}
                    mono
                  />
                  <DRow
                    icon={<RefreshCw className="h-3.5 w-3.5" />}
                    label="Last synced"
                    value={
                      selected.synced_at
                        ? new Date(selected.synced_at).toLocaleDateString("en-US", {
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
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-semibold text-[10px] ${selected.active !== false ? "border-green-200 bg-green-50 text-green-700" : "border-border bg-muted text-muted-foreground"}`}
                    >
                      <Check className="h-2.5 w-2.5" />
                      {selected.active !== false ? "Active" : "Inactive"}
                    </span>
                  </div>
                </Sec>
              </div>
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
