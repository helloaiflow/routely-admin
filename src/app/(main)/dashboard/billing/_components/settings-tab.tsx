"use client";

import { useEffect, useState } from "react";

import { Loader2, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type BillingType = "package" | "miles" | "on_demand";
type RuleKey = "stop_type" | "service_type" | "package_type";
type Rule = { if: Partial<Record<RuleKey, string>>; then: BillingType };
// _key is a client-only stable identity for React list rendering — never sent to the server (stripped when building `payload`).
type DraftRule = Rule & { _key: string };

const TYPES: BillingType[] = ["package", "miles", "on_demand"];
const RULE_KEYS: RuleKey[] = ["stop_type", "service_type", "package_type"];

/* The rule VALUE used to be free text — the one field actually deciding
 * whether a rule fires, with no constraint at all. A typo (e.g. "specimin")
 * would silently never match: the rule never fires, the stop bills at
 * whatever the default/next rule resolves to instead, frozen permanently,
 * with no error anywhere — exactly the silent-money failure class this
 * whole billing project exists to eliminate. Constrained to the real,
 * currently-used enum per key instead. */
const RULE_VALUE_OPTIONS: Record<RuleKey, string[]> = {
  stop_type: ["delivery", "pickup", "dropoff", "return"],
  service_type: ["local", "same_day", "on_demand"],
  package_type: ["rx", "specimen", "medical", "cold", "urgent", "document"],
};

/* Same set PATCH /api/client/billing/rates enforces server-side (see that
 * route's TYPES/RULE_KEYS) — kept in lockstep intentionally rather than
 * fetched, since the whole point of this form is that its own validation
 * can never drift ahead of what the server actually accepts. */
export function SettingsTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ kind: "ok" | "error"; message: string } | null>(null);

  const [packageDollars, setPackageDollars] = useState("0.00");
  const [perMileDollars, setPerMileDollars] = useState("0.00");
  const [onDemandPerMileDollars, setOnDemandPerMileDollars] = useState("0.00");
  const [driverPct, setDriverPct] = useState(70);
  const [defaultType, setDefaultType] = useState<BillingType>("package");
  const [rules, setRules] = useState<DraftRule[]>([]);
  // D40/D41 (2026-08-20): courtesy credit per package_type. "" (not "0.00")
  // means unconfigured — distinguishes "no credit" from "explicitly $0",
  // and keeps every package_type's field blank until someone opts in rather
  // than pre-filling six zero-dollar rows.
  const [creditDollars, setCreditDollars] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/client/billing/rates")
      .then((r) => r.json())
      .then((d) => {
        const r = d.billing_rates ?? {};
        setPackageDollars(((r.package ?? 0) / 100).toFixed(2));
        setPerMileDollars(((r.per_mile ?? 0) / 100).toFixed(2));
        setOnDemandPerMileDollars(((r.on_demand_per_mile ?? 0) / 100).toFixed(2));
        setDriverPct(Number.isInteger(r.on_demand_split?.driver) ? r.on_demand_split.driver : 70);
        setDefaultType(TYPES.includes(d.default_billing_type) ? d.default_billing_type : "package");
        const loadedRules: Rule[] = Array.isArray(d.billing_rules)
          ? d.billing_rules.filter((rule: unknown): rule is Rule => {
              const r2 = rule as Rule;
              return !!r2?.if && typeof r2.if === "object" && TYPES.includes(r2.then);
            })
          : [];
        setRules(loadedRules.map((rule) => ({ ...rule, _key: crypto.randomUUID() })));
        const cr = d.credit_rules ?? {};
        const loadedCredits: Record<string, string> = {};
        for (const pt of RULE_VALUE_OPTIONS.package_type) {
          if (Number.isInteger(cr[pt]) && cr[pt] > 0) loadedCredits[pt] = (cr[pt] / 100).toFixed(2);
        }
        setCreditDollars(loadedCredits);
      })
      .catch(() => setResult({ kind: "error", message: "Failed to load current rates." }))
      .finally(() => setLoading(false));
  }, []);

  const packageCents = Math.round(Number(packageDollars) * 100);
  const perMileCents = Math.round(Number(perMileDollars) * 100);
  const onDemandPerMileCents = Math.round(Number(onDemandPerMileDollars) * 100);
  const routelyPct = 100 - driverPct;

  const creditCents: Record<string, number> = {};
  for (const [pt, v] of Object.entries(creditDollars)) {
    if (v.trim() !== "") creditCents[pt] = Math.round(Number(v) * 100);
  }

  const payload = {
    billing_rates: {
      package: packageCents,
      per_mile: perMileCents,
      on_demand_per_mile: onDemandPerMileCents,
      on_demand_split: { driver: driverPct, routely: routelyPct },
    },
    default_billing_type: defaultType,
    billing_rules: rules.map(({ _key, ...rule }) => rule),
    credit_rules: creditCents,
  };

  const moneyValid = [packageCents, perMileCents, onDemandPerMileCents].every((n) => Number.isInteger(n) && n >= 0);
  const splitValid = Number.isInteger(driverPct) && driverPct >= 0 && driverPct <= 100;
  const rulesValid = rules.every((rule) => {
    const keys = Object.keys(rule.if) as RuleKey[];
    return keys.length > 0 && keys.every((k) => (rule.if[k] ?? "").trim().length > 0) && TYPES.includes(rule.then);
  });
  const creditsValid = Object.values(creditCents).every((n) => Number.isInteger(n) && n >= 0);
  const canSave = moneyValid && splitValid && rulesValid && creditsValid && !saving;

  async function save() {
    setSaving(true);
    setResult(null);
    try {
      const r = await fetch("/api/client/billing/rates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (r.ok) setResult({ kind: "ok", message: "Saved — takes effect on the next stop reserved or attempted." });
      else setResult({ kind: "error", message: String(d?.error ?? "Save failed.") });
    } catch {
      setResult({ kind: "error", message: "Network error — nothing was saved." });
    } finally {
      setSaving(false);
    }
  }

  function addRule() {
    setRules((rs) => [
      ...rs,
      // biome-ignore lint/suspicious/noThenProperty: `then` is the exact field name billing_rules stores and PATCH /api/client/billing/rates validates — not a thenable.
      { if: { service_type: RULE_VALUE_OPTIONS.service_type[0] }, then: "package", _key: crypto.randomUUID() },
    ]);
  }
  function removeRule(key: string) {
    setRules((rs) => rs.filter((r) => r._key !== key));
  }
  function updateRuleKey(key: string, ruleKey: RuleKey) {
    // Reset to the new key's first valid value rather than carrying over the
    // old key's value — a package_type value like "specimen" left sitting
    // under service_type would be exactly the kind of silently-invalid state
    // this form exists to prevent.
    setRules((rs) => rs.map((r) => (r._key === key ? { ...r, if: { [ruleKey]: RULE_VALUE_OPTIONS[ruleKey][0] } } : r)));
  }
  function updateRuleValue(key: string, value: string) {
    setRules((rs) =>
      rs.map((r) => {
        if (r._key !== key) return r;
        const ruleKey = (Object.keys(r.if)[0] as RuleKey) ?? "service_type";
        return { ...r, if: { [ruleKey]: value } };
      }),
    );
  }
  function updateRuleThen(key: string, then: BillingType) {
    setRules((rs) => rs.map((r) => (r._key === key ? { ...r, then } : r)));
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-52 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="grid @4xl/main:grid-cols-[1fr_360px] gap-4">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-14">Base rates</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="rate-package" className="text-12">
                  Per package ($)
                </Label>
                <Input
                  id="rate-package"
                  type="number"
                  min="0"
                  step="0.01"
                  value={packageDollars}
                  onChange={(e) => setPackageDollars(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rate-mile" className="text-12">
                  Per mile ($)
                </Label>
                <Input
                  id="rate-mile"
                  type="number"
                  min="0"
                  step="0.01"
                  value={perMileDollars}
                  onChange={(e) => setPerMileDollars(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rate-ondemand" className="text-12">
                  On-demand, per mile ($)
                </Label>
                <Input
                  id="rate-ondemand"
                  type="number"
                  min="0"
                  step="0.01"
                  value={onDemandPerMileDollars}
                  onChange={(e) => setOnDemandPerMileDollars(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rate-split" className="text-12">
                On-demand split — driver share (%)
              </Label>
              <div className="flex items-center gap-3">
                <Input
                  id="rate-split"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={driverPct}
                  onChange={(e) => setDriverPct(Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))))}
                  className="h-9 w-24"
                />
                <span className="text-12 text-muted-foreground">
                  driver · {routelyPct}% Routely — always sums to 100
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rate-default-type" className="text-12">
                Default billing type
              </Label>
              <p className="text-11 text-muted-foreground">
                Used when no rule below matches and the stop has no explicit override.
              </p>
              <NativeSelect
                id="rate-default-type"
                value={defaultType}
                onChange={(e) => setDefaultType(e.target.value as BillingType)}
                className="w-48"
              >
                {TYPES.map((t) => (
                  <NativeSelectOption key={t} value={t}>
                    {t}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-14">Rules</CardTitle>
            <Button variant="outline" size="sm" className="h-7 gap-1 text-12" onClick={addRule}>
              <Plus className="size-3.5" /> Add rule
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-11 text-muted-foreground">
              Checked in order, top to bottom — the first match wins. A stop with an explicit billing type always
              overrides every rule here.
            </p>
            {rules.length === 0 && (
              <p className="rounded-lg border border-border/60 border-dashed p-4 text-center text-12 text-muted-foreground">
                No rules — every stop bills at the default type above.
              </p>
            )}
            {rules.map((rule) => {
              const condKey = (Object.keys(rule.if)[0] as RuleKey) ?? "service_type";
              const value = rule.if[condKey] ?? "";
              const knownValues = RULE_VALUE_OPTIONS[condKey];
              const isUnknownValue = value.length > 0 && !knownValues.includes(value);
              return (
                <div
                  key={rule._key}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 p-2.5"
                >
                  <span className="text-11 text-muted-foreground">If</span>
                  <NativeSelect
                    value={condKey}
                    onChange={(e) => updateRuleKey(rule._key, e.target.value as RuleKey)}
                    className="w-40"
                    size="sm"
                  >
                    {RULE_KEYS.map((k) => (
                      <NativeSelectOption key={k} value={k}>
                        {k}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <span className="text-11 text-muted-foreground">is</span>
                  <NativeSelect
                    value={value}
                    onChange={(e) => updateRuleValue(rule._key, e.target.value)}
                    className={cn("w-36", isUnknownValue && "border-destructive text-destructive")}
                    size="sm"
                  >
                    {isUnknownValue && (
                      <NativeSelectOption value={value}>{value} (not a known value)</NativeSelectOption>
                    )}
                    {knownValues.map((v) => (
                      <NativeSelectOption key={v} value={v}>
                        {v}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <span className="text-11 text-muted-foreground">then bill as</span>
                  <NativeSelect
                    value={rule.then}
                    onChange={(e) => updateRuleThen(rule._key, e.target.value as BillingType)}
                    className="w-32"
                    size="sm"
                  >
                    {TYPES.map((t) => (
                      <NativeSelectOption key={t} value={t}>
                        {t}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-auto size-7"
                    onClick={() => removeRule(rule._key)}
                    aria-label="Remove rule"
                  >
                    <Trash2 className="size-3.5 text-muted-foreground" />
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-14">Credits</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-11 text-muted-foreground">
              A stop that shouldn't be charged is charged normally and gets a credit appended alongside it — there's no
              "don't bill" outcome. Configured per package_type, applies per attempt. Capped at the charge itself — a
              credit can never exceed what it's crediting.
            </p>
            {RULE_VALUE_OPTIONS.package_type.map((pt) => {
              const dollars = creditDollars[pt] ?? "";
              const cents = dollars.trim() !== "" ? Math.round(Number(dollars) * 100) : 0;
              const pctOfPackage = cents > 0 && packageCents > 0 ? Math.round((cents / packageCents) * 100) : null;
              const exceedsPackage = cents > packageCents && packageCents > 0;
              // On-demand cutoff (mileage below which this credit costs Routely
              // money): driver keeps driverPct% regardless of any credit — see
              // Part C report, 2026-08-20. Any package_type can be dispatched
              // on-demand (service_type is independent of package_type), so
              // this applies to every row, not just ones with an explicit
              // package_type -> on_demand rule.
              const cutoffMiles =
                cents > 0 && onDemandPerMileCents > 0 && routelyPct > 0
                  ? cents / ((routelyPct / 100) * onDemandPerMileCents)
                  : null;
              return (
                <div key={pt} className="flex flex-wrap items-start gap-2 rounded-lg border border-border/60 p-2.5">
                  <div className="flex min-w-[160px] items-center gap-2">
                    <span className="text-12 capitalize">{pt}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-11 text-muted-foreground">$</span>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={dollars}
                      onChange={(e) => setCreditDollars((c) => ({ ...c, [pt]: e.target.value }))}
                      className={cn("h-8 w-24", exceedsPackage && "border-destructive text-destructive")}
                    />
                  </div>
                  {cents > 0 && (
                    <div className="min-w-0 flex-1 space-y-0.5 text-11">
                      {exceedsPackage ? (
                        <p className="text-destructive">
                          Exceeds the ${(packageCents / 100).toFixed(2)} package rate — will be capped to the charge at
                          attempt time, never exceeding it.
                        </p>
                      ) : (
                        pctOfPackage != null && (
                          <p className="text-muted-foreground">{pctOfPackage}% of the package rate.</p>
                        )
                      )}
                      {cutoffMiles != null && (
                        <p className="text-muted-foreground">
                          On-demand: the driver keeps {driverPct}% of an on-demand charge regardless of this credit —
                          below ~{cutoffMiles < 10 ? cutoffMiles.toFixed(1) : Math.round(cutoffMiles)} mi, this credit
                          costs Routely money on that stop. Longer on-demand trips are unaffected.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={!canSave}>
            {saving ? (
              <>
                <Loader2 className="size-3.5 animate-spin" /> Saving…
              </>
            ) : (
              "Save changes"
            )}
          </Button>
          {result && (
            <p className={`text-12 ${result.kind === "ok" ? "text-success" : "text-destructive"}`}>{result.message}</p>
          )}
        </div>
      </div>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-13">What will be stored</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-muted/50 p-3 text-11 leading-relaxed">
            {JSON.stringify(payload, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
