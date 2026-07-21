"use client";

import { useEffect, useState } from "react";

import { Loader2, Route, Send, Shuffle } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";

/* Command Center · Integrations (CC0) — Routely staff pick the optimizer engine
 * and SMS provider per tenant, and flip the Circuit hybrid fallback. Admin-only;
 * requires a tenant selected in the header (not "all"). */

type OptimizerEngine = "google" | "ortools" | "mapbox";
type SmsProvider = "telnyx" | "twilio" | "clicksend";

type Settings = {
  tenant_id: number;
  optimizer_engine: OptimizerEngine;
  sms_provider: SmsProvider;
  sms_fallback_order: SmsProvider[];
  circuit_enabled: boolean;
  updated_at: string | null;
};

const OPTIMIZER_LABELS: Record<OptimizerEngine, { label: string; desc: string }> = {
  google: { label: "Google Route Optimization", desc: "Managed · default. VRP con ventanas de tiempo." },
  ortools: { label: "OR-Tools (self-hosted)", desc: "Sin costo por uso. Máximo control." },
  mapbox: { label: "Mapbox Optimization", desc: "Alterno managed." },
};

const SMS_LABELS: Record<SmsProvider, { label: string; desc: string }> = {
  telnyx: { label: "Telnyx", desc: "Principal · más económico." },
  twilio: { label: "Twilio", desc: "Alterno · estándar de industria." },
  clicksend: { label: "ClickSend", desc: "Alterno." },
};

export function IntegrationsTab() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [needsTenant, setNeedsTenant] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/client/settings/integrations")
      .then(async (r) => {
        if (r.status === 409) {
          setNeedsTenant(true);
          return null;
        }
        return r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`));
      })
      .then((d) => d && setSettings(d.settings as Settings))
      .catch(() => setSettings(null))
      .finally(() => setLoading(false));
  }, []);

  async function save(patch: Partial<Settings>, key: string) {
    if (!settings) return;
    const prev = settings;
    setSettings({ ...settings, ...patch }); // optimistic
    setSaving(key);
    const res = await fetch("/api/client/settings/integrations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).catch(() => null);
    if (res?.ok) {
      const j = await res.json();
      if (j.settings) setSettings(j.settings as Settings);
    } else {
      setSettings(prev); // revert
    }
    setSaving(null);
  }

  if (loading) {
    return (
      <div className="grid max-w-3xl gap-5">
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  if (needsTenant) {
    return (
      <Card className="max-w-3xl">
        <CardContent className="flex flex-col items-start gap-1 py-8">
          <p className="font-medium text-sm">Selecciona un tenant</p>
          <p className="text-muted-foreground text-sm">
            La configuración de integraciones es por tenant. Elige un tenant en el selector del
            header (no &quot;All&quot;) para editar su motor de optimización y proveedor de SMS.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!settings) {
    return (
      <Card className="max-w-3xl">
        <CardContent className="py-8 text-muted-foreground text-sm">
          No se pudo cargar la configuración de integraciones.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid max-w-3xl gap-5">
      {/* ── Route optimization engine ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="grid size-7 place-items-center rounded-lg bg-primary/10 text-primary">
              <Route className="size-4" aria-hidden="true" />
            </span>
            Route optimization
          </CardTitle>
          <p className="text-muted-foreground text-sm">
            Motor que ordena las paradas y calcula ETAs al armar una ruta.
          </p>
        </CardHeader>
        <CardContent className="space-y-2 pt-0">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="optimizer" className="text-sm">
              Engine
            </Label>
            <div className="flex items-center gap-2">
              {saving === "optimizer_engine" && (
                <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-hidden="true" />
              )}
              <Select
                value={settings.optimizer_engine}
                onValueChange={(v) => save({ optimizer_engine: v as OptimizerEngine }, "optimizer_engine")}
              >
                <SelectTrigger id="optimizer" className="w-[240px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(OPTIMIZER_LABELS) as OptimizerEngine[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {OPTIMIZER_LABELS[k].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-muted-foreground text-xs">{OPTIMIZER_LABELS[settings.optimizer_engine].desc}</p>
        </CardContent>
      </Card>

      {/* ── SMS provider ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="grid size-7 place-items-center rounded-lg bg-primary/10 text-primary">
              <Send className="size-4" aria-hidden="true" />
            </span>
            SMS provider
          </CardTitle>
          <p className="text-muted-foreground text-sm">
            Proveedor principal para SMS del cliente. Email usa Resend.
          </p>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="sms" className="text-sm">
              Primary
            </Label>
            <div className="flex items-center gap-2">
              {saving === "sms_provider" && (
                <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-hidden="true" />
              )}
              <Select
                value={settings.sms_provider}
                onValueChange={(v) => save({ sms_provider: v as SmsProvider }, "sms_provider")}
              >
                <SelectTrigger id="sms" className="w-[240px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(SMS_LABELS) as SmsProvider[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {SMS_LABELS[k].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-muted-foreground text-xs">{SMS_LABELS[settings.sms_provider].desc}</p>
          <div className="flex items-center gap-2 border-t pt-3 text-muted-foreground text-xs">
            <Shuffle className="size-3.5" aria-hidden="true" />
            Fallback: {settings.sms_fallback_order.map((p) => SMS_LABELS[p].label).join(" → ")}
          </div>
        </CardContent>
      </Card>

      {/* ── Circuit hybrid switch ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Circuit (transición)</CardTitle>
          <p className="text-muted-foreground text-sm">
            Mientras migramos al dispatch propio, Circuit queda como fallback. Apágalo por tenant
            cuando el sistema propio esté probado.
          </p>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4 pt-0">
          <div className="min-w-0">
            <p className="font-medium text-sm leading-tight">Circuit fallback</p>
            <p className="text-muted-foreground text-xs">
              {settings.circuit_enabled ? "Encendido — sync/despacho vía Circuit disponible." : "Apagado — dispatch 100% Routely."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {saving === "circuit_enabled" && (
              <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-hidden="true" />
            )}
            <Switch
              checked={settings.circuit_enabled}
              onCheckedChange={(v) => save({ circuit_enabled: v }, "circuit_enabled")}
              disabled={saving !== null}
            />
          </div>
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-xs">Los cambios se guardan automáticamente · por tenant.</p>
    </div>
  );
}
