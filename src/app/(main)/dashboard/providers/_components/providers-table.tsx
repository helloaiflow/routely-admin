"use client";

import { useEffect, useState } from "react";

import { Loader2, Plug } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/ui/format";
import { cn } from "@/lib/utils";

type ProviderStatus = "active" | "inactive";

type Provider = {
  id: string;
  key: string;
  name: string;
  status: ProviderStatus;
  adapter_ref: string;
  created_at: string;
  updated_at: string;
};

function StatusBadge({ status }: { status: ProviderStatus }) {
  const active = status === "active";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-medium text-11",
        active ? "border-success/25 bg-success/10 text-success" : "border-border bg-muted text-muted-foreground",
      )}
    >
      <span
        className={cn("size-1.5 rounded-full", active ? "bg-success" : "bg-muted-foreground/50")}
        aria-hidden="true"
      />
      {active ? "Active" : "Inactive"}
    </span>
  );
}

export function ProvidersTable() {
  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState("");

  // Deactivate confirm — invalidates every tenant token issued for the provider.
  const [confirmTarget, setConfirmTarget] = useState<Provider | null>(null);

  function load() {
    setLoadError(false);
    fetch("/api/admin/providers")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setProviders((d.items ?? []) as Provider[]))
      .catch(() => {
        setProviders([]);
        setLoadError(true);
      });
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only load, `load` is not memoized so adding it would refetch every render
  useEffect(() => {
    load();
  }, []);

  async function setStatus(provider: Provider, status: ProviderStatus) {
    setBusyKey(provider.key);
    setError("");
    const res = await fetch(`/api/admin/providers/${encodeURIComponent(provider.key)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => null);
    setBusyKey(null);
    if (!res || !res.ok) {
      const j = res ? await res.json().catch(() => ({})) : {};
      setError(j.error || "Could not update the provider — try again.");
      return;
    }
    load();
  }

  function onToggle(provider: Provider, next: boolean) {
    if (!next) {
      setConfirmTarget(provider);
      return;
    }
    void setStatus(provider, "active");
  }

  async function confirmDeactivate() {
    if (!confirmTarget) return;
    const provider = confirmTarget;
    setConfirmTarget(null);
    await setStatus(provider, "inactive");
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4">
        <h1 className="type-title font-bold">Providers</h1>
        <p className="type-desc mt-1">
          Global catalog of integration providers tenants pick from when generating an API token.
        </p>
      </div>

      {error && (
        <p className="mb-3 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-11 text-destructive">
          {error}
        </p>
      )}

      {!providers ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={`provider-${i}`} className="h-12 w-full" />
          ))}
        </div>
      ) : providers.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border/60 border-dashed bg-card px-6 py-14 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
            <Plug className="size-6" aria-hidden="true" />
          </span>
          <p className="type-body-sm font-medium">{loadError ? "Couldn't load providers" : "No providers yet"}</p>
          <p className="type-caption max-w-xs">
            {loadError
              ? "There was a problem reaching the integrations service. Try again."
              : "Providers are added by developers via code + migration."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Key</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Adapter ref</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {providers.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-12">{p.key}</TableCell>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>
                    <StatusBadge status={p.status} />
                  </TableCell>
                  <TableCell className="font-mono text-12 text-muted-foreground">{p.adapter_ref}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(p.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {busyKey === p.key && (
                        <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-hidden="true" />
                      )}
                      <Switch
                        checked={p.status === "active"}
                        disabled={busyKey === p.key}
                        onCheckedChange={(next) => onToggle(p, next)}
                        aria-label={`Toggle ${p.name} active`}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Deactivate confirm — deactivating immediately invalidates every tenant
          token issued for this provider. Activating needs no confirmation. */}
      <AlertDialog open={Boolean(confirmTarget)} onOpenChange={(o) => !o && setConfirmTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate {confirmTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Deactivating this provider will immediately invalidate every tenant token issued for it. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmDeactivate();
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
