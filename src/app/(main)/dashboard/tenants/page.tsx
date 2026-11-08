"use client";

import { useEffect, useMemo, useState } from "react";

import Link from "next/link";

import { Download } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type FunnelRow, formatMinutes, SETUP_STEPS, STEP_LABEL } from "@/lib/onboarding-funnel";

const ALL = "all";
const DURATIONS: Record<string, [number, number]> = {
  "1h": [0, 60],
  "24h": [60, 24 * 60],
  more: [24 * 60, Number.POSITIVE_INFINITY],
};

const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-CA") : "");
const distinct = (values: (string | null)[]) => [...new Set(values.filter((v): v is string => Boolean(v)))].sort();

const CSV_COLUMNS: [string, (row: FunnelRow) => string | number | null][] = [
  ["tenant_id", (r) => r.tenant_id],
  ["company", (r) => r.name],
  ["status", (r) => r.status],
  ["source", (r) => r.source],
  ["medium", (r) => r.medium],
  ["campaign", (r) => r.campaign],
  ["device", (r) => r.device],
  ["region", (r) => r.region],
  ["signup_at", (r) => r.signup_at],
  ["verified_at", (r) => r.verified_at],
  ["done_at", (r) => r.done_at],
  ["first_stop_at", (r) => r.first_stop_at],
  ["last_step", (r) => r.last_step],
  ["total_minutes", (r) => (r.total_minutes == null ? null : Math.round(r.total_minutes))],
];

function downloadCsv(rows: FunnelRow[]) {
  const cell = (value: string | number | null) => {
    const text = value == null ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [
    CSV_COLUMNS.map(([name]) => name).join(","),
    ...rows.map((r) => CSV_COLUMNS.map(([, get]) => cell(get(r))).join(",")),
  ];
  const url = URL.createObjectURL(new Blob([`${lines.join("\n")}\n`], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `routely-tenants-${new Date().toLocaleDateString("en-CA")}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function TenantsPage() {
  const [rows, setRows] = useState<FunnelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [source, setSource] = useState(ALL);
  const [campaign, setCampaign] = useState(ALL);
  const [step, setStep] = useState(ALL);
  const [duration, setDuration] = useState(ALL);
  const [signupFrom, setSignupFrom] = useState("");
  const [signupTo, setSignupTo] = useState("");
  const [doneFrom, setDoneFrom] = useState("");
  const [doneTo, setDoneTo] = useState("");

  useEffect(() => {
    fetch("/api/admin/tenants/funnel")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) setError(body?.error ?? "Could not load tenants.");
        else setRows(body.rows ?? []);
      })
      .catch(() => setError("Could not load tenants."))
      .finally(() => setLoading(false));
  }, []);

  const sources = useMemo(() => distinct(rows.map((r) => r.source)), [rows]);
  const campaigns = useMemo(() => distinct(rows.map((r) => r.campaign)), [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !`${r.tenant_id} ${r.name}`.toLowerCase().includes(q)) return false;
      if (source !== ALL && r.source !== source) return false;
      if (campaign !== ALL && r.campaign !== campaign) return false;
      if (step !== ALL && (r.last_step ?? "legacy") !== step) return false;
      if (duration !== ALL) {
        if (duration === "unfinished") {
          if (r.total_minutes != null || !r.signup_at) return false;
        } else {
          const [min, max] = DURATIONS[duration];
          if (r.total_minutes == null || r.total_minutes < min || r.total_minutes >= max) return false;
        }
      }
      if (signupFrom && day(r.signup_at) < signupFrom) return false;
      if (signupTo && (!r.signup_at || day(r.signup_at) > signupTo)) return false;
      if (doneFrom && (!r.done_at || day(r.done_at) < doneFrom)) return false;
      if (doneTo && (!r.done_at || day(r.done_at) > doneTo)) return false;
      return true;
    });
  }, [rows, query, source, campaign, step, duration, signupFrom, signupTo, doneFrom, doneTo]);

  const filtering =
    [query, signupFrom, signupTo, doneFrom, doneTo].some(Boolean) ||
    [source, campaign, step, duration].some((v) => v !== ALL);
  function clear() {
    setQuery("");
    setSource(ALL);
    setCampaign(ALL);
    setStep(ALL);
    setDuration(ALL);
    setSignupFrom("");
    setSignupTo("");
    setDoneFrom("");
    setDoneTo("");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-semibold text-xl tracking-tight md:text-2xl">Tenants</h1>
          <p className="text-muted-foreground text-sm">Companies on Routely and how they signed up.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => downloadCsv(filtered)} disabled={filtered.length === 0}>
          <Download aria-hidden="true" />
          Export CSV
        </Button>
      </div>

      <fieldset className="flex flex-wrap items-end gap-3">
        <legend className="sr-only">Filters</legend>
        <div className="space-y-1">
          <Label htmlFor="f-query" className="text-xs">
            Search
          </Label>
          <Input
            id="f-query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Company or ID"
            className="w-44"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="f-source" className="text-xs">
            Source
          </Label>
          <NativeSelect id="f-source" value={source} onChange={(e) => setSource(e.target.value)} className="w-36">
            <NativeSelectOption value={ALL}>All sources</NativeSelectOption>
            {sources.map((s) => (
              <NativeSelectOption key={s} value={s}>
                {s}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="f-campaign" className="text-xs">
            Campaign
          </Label>
          <NativeSelect id="f-campaign" value={campaign} onChange={(e) => setCampaign(e.target.value)} className="w-40">
            <NativeSelectOption value={ALL}>All campaigns</NativeSelectOption>
            {campaigns.map((c) => (
              <NativeSelectOption key={c} value={c}>
                {c}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="f-step" className="text-xs">
            Last step
          </Label>
          <NativeSelect id="f-step" value={step} onChange={(e) => setStep(e.target.value)} className="w-40">
            <NativeSelectOption value={ALL}>All steps</NativeSelectOption>
            {[...SETUP_STEPS, "done"].map((s) => (
              <NativeSelectOption key={s} value={s}>
                {STEP_LABEL[s]}
              </NativeSelectOption>
            ))}
            <NativeSelectOption value="legacy">Legacy (no signup)</NativeSelectOption>
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="f-duration" className="text-xs">
            Total time
          </Label>
          <NativeSelect id="f-duration" value={duration} onChange={(e) => setDuration(e.target.value)} className="w-40">
            <NativeSelectOption value={ALL}>Any</NativeSelectOption>
            <NativeSelectOption value="1h">Under 1 hour</NativeSelectOption>
            <NativeSelectOption value="24h">1 to 24 hours</NativeSelectOption>
            <NativeSelectOption value="more">Over 24 hours</NativeSelectOption>
            <NativeSelectOption value="unfinished">Not finished</NativeSelectOption>
          </NativeSelect>
        </div>
        <fieldset className="space-y-1">
          <legend className="font-medium text-xs">Signup date</legend>
          <div className="flex items-center gap-1">
            <Input
              type="date"
              aria-label="Signup from"
              value={signupFrom}
              onChange={(e) => setSignupFrom(e.target.value)}
              className="w-36"
            />
            <span className="text-muted-foreground text-xs">to</span>
            <Input
              type="date"
              aria-label="Signup to"
              value={signupTo}
              onChange={(e) => setSignupTo(e.target.value)}
              className="w-36"
            />
          </div>
        </fieldset>
        <fieldset className="space-y-1">
          <legend className="font-medium text-xs">Done date</legend>
          <div className="flex items-center gap-1">
            <Input
              type="date"
              aria-label="Done from"
              value={doneFrom}
              onChange={(e) => setDoneFrom(e.target.value)}
              className="w-36"
            />
            <span className="text-muted-foreground text-xs">to</span>
            <Input
              type="date"
              aria-label="Done to"
              value={doneTo}
              onChange={(e) => setDoneTo(e.target.value)}
              className="w-36"
            />
          </div>
        </fieldset>
        {filtering && (
          <Button variant="ghost" size="sm" onClick={clear}>
            Clear filters
          </Button>
        )}
      </fieldset>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <p className="text-muted-foreground text-xs" aria-live="polite">
        {loading ? "Loading…" : `${filtered.length} of ${rows.length} tenants`}
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">ID</TableHead>
            <TableHead>Company</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Campaign</TableHead>
            <TableHead>Signup</TableHead>
            <TableHead>Done</TableHead>
            <TableHead>Last step</TableHead>
            <TableHead className="text-right">Total time</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((r) => (
            <TableRow key={r.tenant_id}>
              <TableCell className="font-mono tabular-nums">{r.tenant_id}</TableCell>
              <TableCell>
                <Link href={`/dashboard/tenants/${r.tenant_id}`} className="hover:underline">
                  {r.name}
                </Link>
              </TableCell>
              <TableCell>{r.source ?? "—"}</TableCell>
              <TableCell>{r.campaign ?? "—"}</TableCell>
              <TableCell className="tabular-nums">{shortDate(r.signup_at)}</TableCell>
              <TableCell className="tabular-nums">{shortDate(r.done_at)}</TableCell>
              <TableCell>
                {r.last_step ? (
                  <Badge variant={r.last_step === "done" ? "secondary" : "outline"}>
                    {STEP_LABEL[r.last_step] ?? r.last_step}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground text-xs">Legacy</span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {r.total_minutes != null ? formatMinutes(r.total_minutes) : r.signup_at ? "In progress" : "—"}
              </TableCell>
            </TableRow>
          ))}
          {!loading && filtered.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-muted-foreground text-sm">
                {rows.length ? "No tenants match these filters." : "No tenants."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
