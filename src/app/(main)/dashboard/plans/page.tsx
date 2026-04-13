"use client";

import { useCallback, useEffect, useState } from "react";

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  Calendar,
  Car,
  ChevronRight,
  MapPin,
  Package,
  RefreshCw,
  Route,
  Search,
  X,
  Zap,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

interface SpokePlan {
  _id?: string;
  id?: string;
  spoke_plan_id?: string;
  name?: string;
  title?: string;
  startsAt?: number;
  starts_at?: number;
  status?: string;
  routeCount?: number;
  route_count?: number;
  stopCount?: number;
  stop_count?: number;
  distributedAt?: number;
  distributed_at?: number;
}
interface SpokeRoute {
  id: string;
  name?: string;
  title?: string;
  driver?: { id: string; name?: string };
  driverId?: string;
  stopCount?: number;
  status?: string;
  optimized?: boolean;
}
interface SpokeStop {
  id: string;
  address?: { addressLineOne?: string; city?: string; state?: string; zip?: string };
  recipient?: { name?: string; phone?: string };
  notes?: string;
  orderInfo?: { products?: string; externalOrderId?: string };
  activity?: { success?: boolean; failureReason?: string };
  position?: number;
  eta?: { arrival?: number };
}

const ROUTE_COLORS: Record<string, string> = {
  "CENTRAL FL": "#c0006a",
  "SOUTH FL": "#7a7200",
  "DEERFIELD FL": "#0079a8",
  "NORTH FL": "#007a4a",
};
function routeColor(name?: string): string {
  if (!name) return "#6366f1";
  const u = name.toUpperCase();
  for (const [k, v] of Object.entries(ROUTE_COLORS)) if (u.includes(k)) return v;
  const colors = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444"];
  return colors[name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length];
}
function fmtTs(ts?: number) {
  if (!ts) return "";
  return new Date(ts * 1000).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
function fmtTime(ts?: number) {
  if (!ts) return "";
  return new Date(ts * 1000).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function PlanStatusBadge({ s }: { s?: string }) {
  if (!s) return null;
  const m: Record<string, string> = {
    distributed: "border-blue-200 bg-blue-50 text-blue-700",
    completed: "border-green-200 bg-green-50 text-green-700",
    started: "border-amber-200 bg-amber-50 text-amber-700",
    pending: "border-border bg-muted text-muted-foreground",
  };
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 font-bold text-[9px] capitalize ${m[s] || "border-border bg-muted text-muted-foreground"}`}
    >
      {s}
    </span>
  );
}

export default function PlansPage() {
  const [plans, setPlans] = useState<SpokePlan[]>([]);
  const [selPlan, setSelPlan] = useState<SpokePlan | null>(null);
  const [routes, setRoutes] = useState<SpokeRoute[]>([]);
  const [selRoute, setSelRoute] = useState<SpokeRoute | null>(null);
  const [stops, setStops] = useState<SpokeStop[]>([]);
  const [selStop, setSelStop] = useState<SpokeStop | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadRoutes, setLoadRoutes] = useState(false);
  const [loadStops, setLoadStops] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/data/spoke-plans?limit=100");
      if (!res.ok) {
        setError(`DB error ${res.status}`);
        return;
      }
      const d = await res.json();
      setPlans(d.list || []);
    } catch {
      setError("Failed to load plans");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  const selectPlan = async (plan: SpokePlan) => {
    setSelPlan(plan);
    setSelRoute(null);
    setSelStop(null);
    setRoutes([]);
    setStops([]);
    setLoadRoutes(true);
    try {
      const planId = plan.spoke_plan_id || plan.id || "";
      const res = await fetch(`/api/spoke/plans?id=${encodeURIComponent(planId)}`);
      const d = await res.json();
      setRoutes(d.routes || []);
    } finally {
      setLoadRoutes(false);
    }
  };

  const selectRoute = async (route: SpokeRoute) => {
    setSelRoute(route);
    setSelStop(null);
    setStops([]);
    setLoadStops(true);
    try {
      const res = await fetch(`/api/spoke/routes?id=${encodeURIComponent(route.id)}`);
      const d = await res.json();
      setStops(d.stops || []);
    } finally {
      setLoadStops(false);
    }
  };

  const filteredPlans = search
    ? plans.filter((p) => (p.name || p.title || "").toLowerCase().includes(search.toLowerCase()))
    : plans;

  const planDate = (p: SpokePlan) => fmtTs(p.startsAt || p.starts_at);
  const planTitle = (p: SpokePlan) =>
    p.title || p.name || (p.spoke_plan_id || p.id || "").replace("plans/", "").slice(0, 10);

  return (
    <div className="flex h-[calc(100vh-5rem)] overflow-hidden rounded-xl border bg-background shadow-sm">
      {/* COL 1 - Plans */}
      <div className="flex w-[260px] shrink-0 flex-col overflow-hidden border-r">
        <div className="border-b bg-muted/10 px-3.5 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-bold text-sm">Spoke Plans</h1>
              <p className="text-[10px] text-muted-foreground">{plans.length} plans loaded</p>
            </div>
            <motion.button
              whileTap={{ rotate: 180 }}
              type="button"
              onClick={fetchPlans}
              disabled={loading}
              className="flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            </motion.button>
            <button
              type="button"
              disabled={loading}
              onClick={async () => {
                setLoading(true);
                await fetch("/api/spoke/sync-plans", { method: "POST" });
                await fetchPlans();
              }}
              className="flex h-6 items-center gap-1 rounded-lg bg-primary/10 px-2 font-semibold text-[10px] text-primary hover:bg-primary/20 disabled:opacity-50"
            >
              <Zap className="h-3 w-3" />
              Sync
            </button>
          </div>
          <div className="relative mt-2">
            <Search className="absolute top-1/2 left-2.5 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search plans..."
              className="h-7 pl-7 text-xs"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {loading ? (
            <div className="space-y-1.5 p-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-14 rounded-xl" style={{ opacity: 1 - i * 0.15 }} />
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-2 px-4 pt-10 text-center text-muted-foreground">
              <AlertCircle className="h-8 w-8 opacity-20" />
              <p className="text-xs">{error}</p>
            </div>
          ) : filteredPlans.length === 0 ? (
            <div className="flex flex-col items-center gap-2 pt-10 text-muted-foreground">
              <Route className="h-8 w-8 opacity-15" />
              <p className="text-xs">No plans found</p>
            </div>
          ) : (
            filteredPlans.map((plan) => {
              const isSel = selPlan?.id === plan.id;
              const color = routeColor(planTitle(plan));
              return (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => selectPlan(plan)}
                  className={`flex w-full items-start gap-2.5 px-3.5 py-3 text-left transition-colors ${isSel ? "border-primary border-r-[3px] bg-primary/5" : "hover:bg-muted/50"}`}
                >
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-bold text-white text-xs"
                    style={{ background: color }}
                  >
                    {planTitle(plan).slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-medium text-xs">{planTitle(plan)}</span>
                      <PlanStatusBadge s={plan.status} />
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                      {planDate(plan) && (
                        <span className="flex items-center gap-0.5">
                          <Calendar className="h-2.5 w-2.5" />
                          {planDate(plan)}
                        </span>
                      )}
                      {(plan.routeCount || plan.route_count) != null && (
                        <span className="flex items-center gap-0.5">
                          <Route className="h-2.5 w-2.5" />
                          {plan.routeCount || plan.route_count}
                        </span>
                      )}
                      {(plan.stopCount || plan.stop_count) != null && (
                        <span className="flex items-center gap-0.5">
                          <MapPin className="h-2.5 w-2.5" />
                          {plan.stopCount || plan.stop_count}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight
                    className={`mt-2 h-3.5 w-3.5 shrink-0 transition-colors ${isSel ? "text-primary" : "text-muted-foreground/30"}`}
                  />
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* COL 2 - Routes */}
      <div className="flex w-[240px] shrink-0 flex-col overflow-hidden border-r">
        {!selPlan ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-muted-foreground">
            <Route className="h-10 w-10 opacity-15" />
            <p className="text-center text-xs">Select a plan to view its routes</p>
          </div>
        ) : (
          <>
            <div className="border-b bg-muted/10 px-3.5 py-3">
              <p className="truncate font-semibold text-xs">{planTitle(selPlan)}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {routes.length} route{routes.length !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto py-1">
              {loadRoutes ? (
                <div className="space-y-1.5 p-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12 rounded-xl" style={{ opacity: 1 - i * 0.2 }} />
                  ))}
                </div>
              ) : routes.length === 0 ? (
                <div className="flex flex-col items-center gap-2 pt-10 text-muted-foreground">
                  <Route className="h-8 w-8 opacity-15" />
                  <p className="text-xs">No routes</p>
                </div>
              ) : (
                routes.map((route) => {
                  const isSel = selRoute?.id === route.id;
                  const name = route.title || route.name || route.id.replace("routes/", "").slice(0, 10);
                  const color = routeColor(name);
                  const driverName = route.driver?.name || "";
                  return (
                    <button
                      key={route.id}
                      type="button"
                      onClick={() => selectRoute(route)}
                      className={`flex w-full items-start gap-2.5 px-3.5 py-2.5 text-left transition-colors ${isSel ? "border-primary border-r-[3px] bg-primary/5" : "hover:bg-muted/50"}`}
                    >
                      <div className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
                      <div className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-xs">{name}</span>
                        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                          {driverName && (
                            <span className="flex items-center gap-0.5">
                              <Car className="h-2.5 w-2.5" />
                              {driverName.split(" ")[0]}
                            </span>
                          )}
                          {route.stopCount != null && (
                            <span className="flex items-center gap-0.5">
                              <MapPin className="h-2.5 w-2.5" />
                              {route.stopCount} stops
                            </span>
                          )}
                          {route.status && <PlanStatusBadge s={route.status} />}
                        </div>
                      </div>
                      <ChevronRight
                        className={`mt-1 h-3 w-3 shrink-0 transition-colors ${isSel ? "text-primary" : "text-muted-foreground/30"}`}
                      />
                    </button>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>

      {/* COL 3 - Stops + detail */}
      <div className="flex flex-1 overflow-hidden">
        <div
          className={`flex flex-col overflow-hidden border-r transition-all ${selStop ? "w-[280px] shrink-0" : "flex-1"}`}
        >
          {!selRoute ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-muted-foreground">
              <MapPin className="h-10 w-10 opacity-15" />
              <p className="text-center text-xs">Select a route to view its stops</p>
            </div>
          ) : (
            <>
              <div className="border-b bg-muted/10 px-4 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="truncate font-semibold text-xs">{selRoute.title || selRoute.name || "Route"}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {stops.length} stop{stops.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  {selStop && (
                    <button
                      type="button"
                      onClick={() => setSelStop(null)}
                      className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3 w-3" /> Close detail
                    </button>
                  )}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto py-1">
                {loadStops ? (
                  <div className="space-y-1.5 p-2">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Skeleton key={i} className="h-12 rounded-xl" style={{ opacity: 1 - i * 0.15 }} />
                    ))}
                  </div>
                ) : stops.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 pt-10 text-muted-foreground">
                    <Package className="h-8 w-8 opacity-15" />
                    <p className="text-xs">No stops</p>
                  </div>
                ) : (
                  stops.map((stop, idx) => {
                    const isSel = selStop?.id === stop.id;
                    const name = stop.recipient?.name || stop.orderInfo?.products || "Unknown";
                    const addr = stop.address?.addressLineOne || "No address";
                    const succeeded = stop.activity?.success;
                    return (
                      <button
                        key={stop.id}
                        type="button"
                        onClick={() => setSelStop(isSel ? null : stop)}
                        className={`flex w-full items-start gap-2.5 px-4 py-2.5 text-left transition-colors ${isSel ? "border-primary border-r-[3px] bg-primary/5" : "hover:bg-muted/50"}`}
                      >
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted font-bold text-[9px] text-muted-foreground">
                          {stop.position || idx + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-xs">{name}</span>
                          <div className="mt-0.5 flex items-center gap-1">
                            <MapPin className="h-2.5 w-2.5 shrink-0 text-muted-foreground/60" />
                            <span className="truncate text-[10px] text-muted-foreground">{addr}</span>
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          {succeeded === true && <span className="text-green-500">{"\u2713"}</span>}
                          {succeeded === false && stop.activity?.failureReason && (
                            <span className="text-rose-500">{"\u2717"}</span>
                          )}
                          {stop.eta?.arrival && (
                            <span className="text-[9px] text-muted-foreground">{fmtTime(stop.eta.arrival)}</span>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>

        {/* Stop detail panel */}
        <AnimatePresence>
          {selStop && (
            <motion.div
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.18 }}
              className="flex flex-1 flex-col overflow-hidden"
            >
              <div
                className="border-b px-5 py-4"
                style={{ background: `linear-gradient(135deg, ${routeColor(selRoute?.title || "")}15, transparent)` }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-bold text-sm">
                      {selStop.recipient?.name || selStop.orderInfo?.products || "Stop"}
                    </p>
                    <div className="mt-1 flex items-center gap-1.5">
                      {selStop.activity?.success === true && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 font-bold text-[9px] text-green-700">
                          {"\u2713"} Delivered
                        </span>
                      )}
                      {selStop.activity?.success === false && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 font-bold text-[9px] text-rose-700">
                          {"\u2717"} Failed
                        </span>
                      )}
                      {selStop.activity?.success == null && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 font-medium text-[9px] text-muted-foreground">
                          Pending
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelStop(null)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
                {selStop.address && (
                  <Sec title="Address">
                    <DetailRow label="Street" value={selStop.address.addressLineOne || "\u2014"} />
                    {selStop.address.city && <DetailRow label="City" value={selStop.address.city} />}
                    {selStop.address.state && <DetailRow label="State" value={selStop.address.state} />}
                    {selStop.address.zip && <DetailRow label="ZIP" value={selStop.address.zip} />}
                  </Sec>
                )}
                {selStop.recipient && (
                  <Sec title="Recipient">
                    {selStop.recipient.name && <DetailRow label="Name" value={selStop.recipient.name} />}
                    {selStop.recipient.phone && <DetailRow label="Phone" value={selStop.recipient.phone} mono />}
                  </Sec>
                )}
                {selStop.orderInfo && (
                  <Sec title="Order">
                    {selStop.orderInfo.externalOrderId && (
                      <DetailRow label="RT Scan ID" value={selStop.orderInfo.externalOrderId} mono />
                    )}
                    {selStop.orderInfo.products && <DetailRow label="Products" value={selStop.orderInfo.products} />}
                  </Sec>
                )}
                {selStop.eta?.arrival && (
                  <Sec title="Timing">
                    <DetailRow label="ETA" value={fmtTime(selStop.eta.arrival)} />
                    <DetailRow label="Stop #" value={String(selStop.position || "\u2014")} />
                  </Sec>
                )}
                {selStop.notes && (
                  <Sec title="Notes">
                    <div className="px-3 py-2.5">
                      <p className="whitespace-pre-wrap text-muted-foreground text-xs leading-relaxed">
                        {selStop.notes}
                      </p>
                    </div>
                  </Sec>
                )}
                {selStop.activity?.failureReason && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5">
                    <p className="font-bold text-[9px] text-rose-400 uppercase tracking-widest">Failure reason</p>
                    <p className="mt-1 font-medium text-rose-700 text-xs">{selStop.activity.failureReason}</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
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
function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5">
      <span className="shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <span
        className={`max-w-[200px] truncate text-right font-medium text-[11px] ${mono ? "font-mono text-muted-foreground" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}
