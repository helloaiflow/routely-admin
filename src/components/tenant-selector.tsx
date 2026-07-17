"use client";

import { useEffect, useState } from "react";

import { Building2, Check, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type Tenant = { tenant_id: number; name: string };

function getCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * ADMIN cross-tenant scope selector. Writes the `admin_tenant` cookie that
 * getTenantContext() reads server-side ("all" or a tenant_id), then reloads so
 * every page/API re-resolves against the new scope. Self-hides for non-admins
 * (the /api/admin/tenants endpoint 403s and returns no tenants).
 */
export function TenantSelector() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [current, setCurrent] = useState<string>("all");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const c = getCookie("admin_tenant");
    setCurrent(c && /^\d+$/.test(c) ? c : "all");
    fetch("/api/admin/tenants")
      .then((r) => (r.ok ? r.json() : { tenants: [] }))
      .then((d) => {
        setTenants(d.tenants ?? []);
        setReady(true);
      })
      .catch(() => setReady(true));
  }, []);

  function select(val: string) {
    document.cookie = `admin_tenant=${val}; path=/; max-age=31536000`;
    setCurrent(val);
    window.location.reload();
  }

  // Non-admins (or if the endpoint fails) get no tenants → render nothing.
  if (ready && tenants.length === 0) return null;

  const label =
    current === "all"
      ? "All tenants"
      : (tenants.find((t) => String(t.tenant_id) === current)?.name ?? `Tenant ${current}`);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
          <Building2 className="size-3.5 text-primary" />
          <span className="max-w-[140px] truncate">{label}</span>
          <ChevronsUpDown className="size-3.5 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 w-56 overflow-y-auto">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Tenant scope
        </DropdownMenuLabel>
        <DropdownMenuItem onClick={() => select("all")} className="gap-2">
          <Check className={cn("size-3.5", current === "all" ? "opacity-100" : "opacity-0")} />
          <span>All tenants</span>
        </DropdownMenuItem>
        {tenants.length > 0 && <DropdownMenuSeparator />}
        {tenants.map((t) => (
          <DropdownMenuItem key={t.tenant_id} onClick={() => select(String(t.tenant_id))} className="gap-2">
            <Check
              className={cn("size-3.5", current === String(t.tenant_id) ? "opacity-100" : "opacity-0")}
            />
            <span className="truncate">{t.name}</span>
            <span className="ml-auto font-mono text-[10px] text-muted-foreground">#{t.tenant_id}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
