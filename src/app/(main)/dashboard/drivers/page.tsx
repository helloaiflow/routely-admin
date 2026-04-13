"use client";

import { useCallback, useEffect, useState } from "react";

import { AnimatePresence, motion } from "framer-motion";
import { Car, Check, Loader2, Mail, MapPin, Phone, RefreshCw, Search, X, Zap } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

interface SpokeDriver {
  id: string;
  name?: string;
  full_name?: string;
  email?: string;
  phone?: string;
  active?: boolean;
  depotId?: string;
  depot_id?: string;
}

interface LocalDriver {
  _id: string;
  full_name?: string;
  name?: string;
  email?: string;
  phone?: string;
  vehicle_type?: string;
  license_plate?: string;
  service_area?: string;
  status?: string;
  spoke_driver_id?: string;
  active?: boolean;
  depot_id?: string;
  synced_at?: string;
}

type Driver = LocalDriver & { _spoke?: SpokeDriver };

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
function initials(name?: string) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
function avatarColor(name?: string) {
  const idx = (name || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_COLORS[idx % AVATAR_COLORS.length];
}

function StatusDot({ active }: { active?: boolean }) {
  return <div className={`h-2 w-2 rounded-full ${active !== false ? "bg-green-500" : "bg-gray-300"}`} />;
}

export default function DriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [selected, setSelected] = useState<Driver | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");

  const fetchAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [localRes, spokeRes] = await Promise.all([
        fetch("/api/data/drivers?limit=100"),
        fetch("/api/spoke/drivers"),
      ]);
      const localData = localRes.ok ? await localRes.json() : { list: [] };
      const spokeData = spokeRes.ok ? await spokeRes.json() : { drivers: [] };
      const spokeList: SpokeDriver[] = spokeData.drivers || [];

      const merged: Driver[] = (localData.list || []).map((d: LocalDriver) => {
        const s = spokeList.find((x) => x.id === d.spoke_driver_id);
        return { ...d, _spoke: s };
      });

      for (const s of spokeList) {
        const exists = merged.find((d) => d.spoke_driver_id === s.id);
        if (!exists) {
          merged.push({
            _id: `spoke_${s.id}`,
            full_name: s.name || s.full_name,
            email: s.email,
            phone: s.phone,
            active: s.active !== false,
            spoke_driver_id: s.id,
            depot_id: s.depotId || s.depot_id,
            _spoke: s,
          } as Driver);
        }
      }

      setDrivers(merged.sort((a, b) => (a.full_name || "").localeCompare(b.full_name || "")));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const syncSpoke = async () => {
    setSyncing(true);
    setSyncMsg("");
    try {
      const res = await fetch("/api/spoke/drivers", { method: "POST" });
      const d = await res.json();
      setSyncMsg(`${d.added || 0} added \u00B7 ${d.updated || 0} updated`);
      await fetchAll(true);
      setTimeout(() => setSyncMsg(""), 3000);
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
  const spokeLinked = drivers.filter((d) => d.spoke_driver_id).length;

  return (
    <div
      className="h-[calc(100vh-5rem)] overflow-hidden rounded-xl border bg-background shadow-sm"
      style={{ display: "grid", gridTemplateColumns: "280px 1fr", gridTemplateRows: "1fr" }}
    >
      {/* COL 1 - List */}
      <div className="flex flex-col overflow-hidden border-r">
        <div className="border-b bg-muted/10 px-3.5 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-bold text-sm">Spoke Drivers</h1>
              <p className="text-[10px] text-muted-foreground">
                {activeCount} active \u00B7 {drivers.length} total
              </p>
            </div>
            <div className="flex gap-1">
              <motion.button
                whileTap={{ rotate: 180 }}
                type="button"
                onClick={() => fetchAll(true)}
                disabled={loading}
                className="flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
              >
                <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
              </motion.button>
              <button
                type="button"
                onClick={syncSpoke}
                disabled={syncing}
                className="flex h-6 items-center gap-1 rounded-lg bg-primary/10 px-2 font-semibold text-[10px] text-primary hover:bg-primary/20 disabled:opacity-50"
              >
                {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                Sync
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
              <p className="font-bold text-primary text-sm tabular-nums">{spokeLinked}</p>
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
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 pt-12 text-muted-foreground">
              <Car className="h-8 w-8 opacity-15" />
              <p className="text-xs">No drivers found</p>
            </div>
          ) : (
            filtered.map((driver) => {
              const name = driver.full_name || driver.name || "Unknown";
              const isSel = selected?._id === driver._id;
              const cls = avatarColor(name);
              const isSpoke = !!driver.spoke_driver_id;
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
                      {isSpoke && <Zap className="h-2.5 w-2.5 shrink-0 text-primary" />}
                    </div>
                    <p className="truncate text-[10px] text-muted-foreground">
                      {driver.email || driver.phone || "No contact"}
                    </p>
                  </div>
                  {driver.vehicle_type && (
                    <span className="shrink-0 text-[9px] text-muted-foreground">{driver.vehicle_type}</span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* COL 2 - Detail */}
      <div className="flex flex-col overflow-hidden">
        {!selected ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50">
              <Car className="h-7 w-7 opacity-25" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-foreground text-sm">Select a driver</p>
              <p className="mt-1 text-xs opacity-55">Details and Spoke info will appear here</p>
            </div>
            <div className="grid w-full max-w-xs grid-cols-2 gap-2 px-6">
              <div className="rounded-xl border bg-card px-3 py-2.5 text-center">
                <p className="font-bold text-foreground text-lg">{drivers.length}</p>
                <p className="text-[10px] text-muted-foreground">Total drivers</p>
              </div>
              <div className="rounded-xl border bg-card px-3 py-2.5 text-center">
                <p className="font-bold text-green-600 text-lg">{activeCount}</p>
                <p className="text-[10px] text-muted-foreground">Active</p>
              </div>
              <div className="col-span-2 rounded-xl border bg-card px-3 py-2.5 text-center">
                <p className="font-bold text-lg text-primary">{spokeLinked}</p>
                <p className="text-[10px] text-muted-foreground">Linked to Spoke</p>
              </div>
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
              <div className="flex items-center gap-3 border-b px-5 py-4">
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl font-bold text-base ${avatarColor(selected.full_name || selected.name)}`}
                >
                  {initials(selected.full_name || selected.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-base leading-tight">
                    {selected.full_name || selected.name || "Unknown"}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <StatusDot active={selected.active} />
                    <span className="text-muted-foreground text-xs capitalize">
                      {selected.active !== false ? "Active" : "Inactive"}
                    </span>
                    {selected.spoke_driver_id && (
                      <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-[9px] text-primary">
                        <Zap className="h-2.5 w-2.5" /> Spoke
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
                  {selected.phone && (
                    <DetailRow icon={<Phone className="h-3.5 w-3.5" />} label="Phone" value={selected.phone} mono />
                  )}
                  {selected.email && (
                    <DetailRow icon={<Mail className="h-3.5 w-3.5" />} label="Email" value={selected.email} />
                  )}
                  {selected.service_area && (
                    <DetailRow icon={<MapPin className="h-3.5 w-3.5" />} label="Area" value={selected.service_area} />
                  )}
                </Sec>

                {(selected.vehicle_type || selected.license_plate) && (
                  <Sec title="Vehicle">
                    {selected.vehicle_type && (
                      <DetailRow icon={<Car className="h-3.5 w-3.5" />} label="Type" value={selected.vehicle_type} />
                    )}
                    {selected.license_plate && (
                      <DetailRow
                        icon={<Car className="h-3.5 w-3.5" />}
                        label="Plate"
                        value={selected.license_plate}
                        mono
                      />
                    )}
                  </Sec>
                )}

                {selected.spoke_driver_id && (
                  <Sec title="Spoke Integration">
                    <DetailRow
                      icon={<Zap className="h-3.5 w-3.5" />}
                      label="Spoke ID"
                      value={selected.spoke_driver_id.replace("drivers/", "")}
                      mono
                    />
                    {selected.depot_id && (
                      <DetailRow
                        icon={<MapPin className="h-3.5 w-3.5" />}
                        label="Depot"
                        value={selected.depot_id.replace("depots/", "").slice(0, 12)}
                        mono
                      />
                    )}
                    {selected.synced_at && (
                      <DetailRow
                        icon={<RefreshCw className="h-3.5 w-3.5" />}
                        label="Synced"
                        value={new Date(selected.synced_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      />
                    )}
                  </Sec>
                )}

                <div className="flex flex-wrap gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-semibold text-xs ${selected.active !== false ? "border-green-200 bg-green-50 text-green-700" : "border-border bg-muted text-muted-foreground"}`}
                  >
                    <Check className="h-3 w-3" />
                    {selected.active !== false ? "Active" : "Inactive"}
                  </span>
                  {selected.status && selected.status !== "active" && (
                    <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 font-semibold text-amber-700 text-xs capitalize">
                      {selected.status.replace(/_/g, " ")}
                    </span>
                  )}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="mb-1.5 font-bold text-[10px] text-muted-foreground/50 uppercase tracking-widest">{title}</p>
      <div className="divide-y overflow-hidden rounded-xl border bg-muted/20">{children}</div>
    </section>
  );
}
function DetailRow({
  icon,
  label,
  value,
  mono,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5">
      <div className="flex items-center gap-2 text-muted-foreground">
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
