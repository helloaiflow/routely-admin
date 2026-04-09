"use client";

import { useCallback, useEffect, useState } from "react";

import { Check, CreditCard, RefreshCw, Users, Zap } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const API_TENANTS = "https://routelypro.com/api/tenants";
const API_PLANS = "https://routelypro.com/api/data/saas-plans";

const PLAN_COLORS: Record<string, string> = {
  free_trial: "bg-gray-100 text-gray-700",
  starter: "bg-blue-100 text-blue-700",
  professional: "bg-violet-100 text-violet-700",
  enterprise: "bg-amber-100 text-amber-800",
};

const PLAN_ICONS: Record<string, typeof Zap> = {
  free_trial: Zap,
  starter: CreditCard,
  professional: Users,
  enterprise: Check,
};

interface Tenant {
  tenant_id: number;
  company_name?: string;
  email?: string;
  plan_type?: string;
  plan?: string;
  status?: string;
  trial_ends_at?: string;
  packages_this_month?: number;
}

interface Plan {
  plan_id: string;
  name: string;
  price_per_package: number;
  price_per_mile: number;
  features?: Record<string, boolean | number>;
}

export default function PlansPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Tenant | null>(null);
  const [selectedPlan, setSelectedPlan] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [tr, pr] = await Promise.all([fetch(API_TENANTS), fetch(API_PLANS)]);
      if (tr.ok) {
        const d = await tr.json();
        setTenants(d.list || []);
      }
      if (pr.ok) {
        const d = await pr.json();
        setPlans(d.list || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openChangePlan = (tenant: Tenant) => {
    setEditing(tenant);
    setSelectedPlan(tenant.plan_type || tenant.plan || "free_trial");
    setDialogOpen(true);
  };

  const savePlan = async () => {
    if (!editing || !selectedPlan) return;
    setSaving(true);
    try {
      const plan = plans.find((p) => p.plan_id === selectedPlan);
      await fetch(API_TENANTS, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: editing.tenant_id,
          plan_type: selectedPlan,
          plan: selectedPlan,
          price_per_package: plan?.price_per_package ?? 0,
          price_per_mile: plan?.price_per_mile ?? 0,
          features: plan?.features ?? {},
        }),
      });
      setDialogOpen(false);
      await fetchData();
    } finally {
      setSaving(false);
    }
  };

  const planLabel = (planId: string) => plans.find((p) => p.plan_id === planId)?.name || planId;
  const planPrice = (planId: string) => {
    const p = plans.find((x) => x.plan_id === planId);
    if (!p) return "—";
    if (p.price_per_package === 0) return "Free";
    return `$${p.price_per_package}/stop + $${p.price_per_mile}/mi`;
  };

  if (loading)
    return (
      <div className="p-6">
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Plans & Billing</h1>
          <p className="text-sm text-muted-foreground">Manage tenant subscriptions and plan assignments</p>
        </div>
        <Button variant="outline" onClick={fetchData}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Plan cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {plans.map((plan) => {
          const Icon = PLAN_ICONS[plan.plan_id] || Zap;
          const count = tenants.filter((t) => (t.plan_type || t.plan) === plan.plan_id).length;
          return (
            <Card key={plan.plan_id} className="relative overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-xl ${PLAN_COLORS[plan.plan_id] || "bg-gray-100 text-gray-700"}`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {count} tenant{count !== 1 ? "s" : ""}
                  </Badge>
                </div>
                <CardTitle className="mt-2 text-base">{plan.name}</CardTitle>
                <CardDescription className="text-xs">
                  {plan.price_per_package === 0
                    ? "Free"
                    : `$${plan.price_per_package}/stop · $${plan.price_per_mile}/mi`}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-1">
                  {plan.features &&
                    Object.entries(plan.features)
                      .filter(([, v]) => v === true)
                      .slice(0, 4)
                      .map(([k]) => (
                        <div key={k} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Check className="h-3 w-3 shrink-0 text-green-500" />
                          {k.replace(/_/g, " ")}
                        </div>
                      ))}
                  {plan.features?.max_users && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Users className="h-3 w-3 shrink-0 text-blue-500" />
                      {plan.features.max_users === 999 ? "Unlimited" : plan.features.max_users} users
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Tenants table */}
      <Card>
        <CardHeader>
          <CardTitle>Tenant Subscriptions</CardTitle>
          <CardDescription>All tenants and their current plan assignment</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Trial Ends</TableHead>
                <TableHead>Packages/mo</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants.map((t) => {
                const planId = t.plan_type || t.plan || "free_trial";
                const trialEnd = t.trial_ends_at ? new Date(t.trial_ends_at) : null;
                const trialExpired = trialEnd ? trialEnd < new Date() : false;
                return (
                  <TableRow key={t.tenant_id} className="hover:bg-muted/50">
                    <TableCell>
                      <span className="rounded bg-muted px-2 py-1 font-mono text-xs">#{t.tenant_id}</span>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium">{t.company_name || "—"}</p>
                        <p className="text-xs text-muted-foreground">{t.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${PLAN_COLORS[planId] || "bg-gray-100 text-gray-700"}`}
                      >
                        {planLabel(planId)}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{planPrice(planId)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          t.status === "active" ? "default" : t.status === "pending_setup" ? "secondary" : "outline"
                        }
                      >
                        {t.status || "unknown"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {trialEnd ? (
                        <span
                          className={`text-xs ${trialExpired ? "font-medium text-red-500" : "text-muted-foreground"}`}
                        >
                          {trialExpired ? "Expired " : ""}
                          {trialEnd.toLocaleDateString()}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">{t.packages_this_month ?? 0}</TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" onClick={() => openChangePlan(t)}>
                        Change Plan
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Change Plan Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Change Plan</DialogTitle>
            <DialogDescription>
              Update plan for <strong>{editing?.company_name || editing?.email}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Select Plan</Label>
              <Select value={selectedPlan} onValueChange={setSelectedPlan}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {plans.map((p) => (
                    <SelectItem key={p.plan_id} value={p.plan_id}>
                      <div className="flex items-center gap-2">
                        <span>{p.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {p.price_per_package === 0 ? "Free" : `$${p.price_per_package}/stop`}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedPlan && plans.find((p) => p.plan_id === selectedPlan) && (
              <div className="space-y-2 rounded-xl border bg-muted/30 p-4">
                {(() => {
                  const p = plans.find((x) => x.plan_id === selectedPlan)!;
                  return (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Price per stop</span>
                        <span className="font-medium">${p.price_per_package}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Price per mile</span>
                        <span className="font-medium">${p.price_per_mile}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Max users</span>
                        <span className="font-medium">
                          {p.features?.max_users === 999 ? "Unlimited" : p.features?.max_users}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">AI Agent</span>
                        <span className="font-medium">{p.features?.ai_agent_calls ? "Included" : "Not included"}</span>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={savePlan} disabled={saving}>
                {saving ? "Saving..." : "Update Plan"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
