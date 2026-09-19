"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { CircleCheck, Flag, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

/* Driver Applicants (M1 skeleton): list + detail (signals with provenance, verifications,
 * documents, audit timeline) + Approve. Reads /api/client/driver-applicants (Supabase),
 * approves via the FastAPI proxy. Intentionally unpolished. */

type Applicant = {
  id: string;
  application_ref: string;
  status: string;
  current_step: string;
  next_action: string;
  acquisition_source: string;
  name: string | null;
  zone: string | null;
  flags: number;
  created_at: string;
  updated_at: string;
};

type Detail = {
  applicant: Omit<Applicant, "name" | "zone" | "flags">;
  profile: {
    legal_name: string | null;
    dob: string | null;
    phone: string | null;
    email: string | null;
    address: { line1?: string; city?: string; state?: string; zip?: string } | null;
    languages: string[] | null;
  } | null;
  documents: { id: string; kind: string; status: string; masked_number: string | null; size_bytes: number | null }[];
  consents: { purpose: string; version: string; accepted_at: string }[];
  signals: {
    dimension: string;
    state: string;
    confidence: number | null;
    flag_for_review: boolean;
    provenance: Record<string, unknown>;
  }[];
  verifications: { kind: string; state: string; source: string }[];
  events: {
    id: number;
    event_type: string;
    actor: string;
    actor_type: string;
    reason: string | null;
    from_state: string | null;
    to_state: string | null;
    occurred_at: string;
  }[];
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  in_progress: "In progress",
  submitted: "Submitted",
  in_review: "In review",
  approved_applicant: "Approved",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

function statusVariant(s: string): "default" | "secondary" | "outline" | "destructive" {
  if (s === "approved_applicant") return "default";
  if (s === "in_review") return "secondary";
  if (s === "rejected" || s === "withdrawn") return "destructive";
  return "outline";
}

const fmt = (iso: string) => new Date(iso).toLocaleString();

export function DriverApplicantsView() {
  const [rows, setRows] = useState<Applicant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/client/driver-applicants${status === "all" ? "" : `?status=${status}`}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRows(((await res.json()) as { applicants: Applicant[] }).applicants);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  // Search matches application_ref (locator) or name, over the loaded rows.
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows ?? [];
    return (rows ?? []).filter(
      (r) => r.application_ref.toLowerCase().includes(needle) || (r.name ?? "").toLowerCase().includes(needle),
    );
  }, [rows, q]);

  return (
    <div className="@container/main w-full space-y-4 px-4 py-3 sm:px-4">
      <div>
        <h1 className="font-semibold text-xl tracking-tight md:text-2xl">Driver Applicants</h1>
        <p className="text-sm text-muted-foreground">
          People moving through onboarding. Approving moves an applicant into the Approved Applicants pool — it does not
          create a driver.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" aria-hidden="true" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search RA-XXXXXX or name"
            className="pl-8"
            aria-label="Search applicants"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.entries(STATUS_LABEL).map(([v, l]) => (
              <SelectItem key={v} value={v}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error ? (
        <p className="text-sm text-destructive">Could not load applicants ({error}).</p>
      ) : rows === null ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : visible.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No applicants {q || status !== "all" ? "match these filters" : "yet"}.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Ref</th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Zone</th>
                <th className="px-3 py-2 font-medium">Flags</th>
                <th className="px-3 py-2 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr
                  key={r.id}
                  className="cursor-pointer border-t hover:bg-muted/30"
                  onClick={() => setSelected(r.application_ref)}
                >
                  <td className="px-3 py-2 font-mono">
                    <button
                      type="button"
                      className="font-mono hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelected(r.application_ref);
                      }}
                    >
                      {r.application_ref}
                    </button>
                  </td>
                  <td className="px-3 py-2">{r.name ?? <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-3 py-2">
                    <Badge variant={statusVariant(r.status)}>{STATUS_LABEL[r.status] ?? r.status}</Badge>
                  </td>
                  <td className="px-3 py-2">{r.zone ?? <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-3 py-2">
                    {r.flags > 0 ? (
                      <span className="inline-flex items-center gap-1 text-amber-600">
                        <Flag className="size-3.5" aria-hidden="true" />
                        {r.flags}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{fmt(r.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ApplicantSheet applicantKey={selected} onClose={() => setSelected(null)} onChanged={load} />
    </div>
  );
}

function ApplicantSheet({
  applicantKey,
  onClose,
  onChanged,
}: {
  applicantKey: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (key: string) => {
    try {
      const res = await fetch(`/api/client/driver-applicants/${encodeURIComponent(key)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDetail((await res.json()) as Detail);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    setDetail(null);
    setError(null);
    if (applicantKey) void load(applicantKey);
  }, [applicantKey, load]);

  async function approve() {
    if (!applicantKey) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/client/driver-applicants/${encodeURIComponent(applicantKey)}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const body = (await res.json().catch(() => ({}))) as { detail?: { message?: string }; error?: string };
      if (!res.ok) throw new Error(body.detail?.message ?? body.error ?? `HTTP ${res.status}`);
      toast.success(`${applicantKey} approved — added to the pool`);
      setConfirming(false);
      setReason("");
      await load(applicantKey);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setBusy(false);
    }
  }

  const a = detail?.applicant;
  const p = detail?.profile;
  return (
    <Sheet open={applicantKey !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 font-mono">
            {applicantKey}
            {a && <Badge variant={statusVariant(a.status)}>{STATUS_LABEL[a.status] ?? a.status}</Badge>}
          </SheetTitle>
          <SheetDescription>
            {a ? `Step: ${a.current_step} · Next action: ${a.next_action} · Source: ${a.acquisition_source}` : " "}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-6 text-sm">
          {error && <p className="text-destructive">Could not load this applicant ({error}).</p>}
          {!detail && !error && <Skeleton className="h-40 w-full" />}
          {detail && a && (
            <>
              {a.status === "in_review" && (
                <Button onClick={() => setConfirming(true)}>
                  <CircleCheck className="size-4" aria-hidden="true" />
                  Approve applicant
                </Button>
              )}

              <Section title="Profile">
                {p ? (
                  <dl className="grid grid-cols-[8rem_1fr] gap-y-1">
                    <Field k="Name" v={p.legal_name} />
                    <Field k="Date of birth" v={p.dob} />
                    <Field k="Phone" v={p.phone} />
                    <Field k="Email" v={p.email} />
                    <Field
                      k="Address"
                      v={
                        p.address
                          ? `${p.address.line1 ?? ""}, ${p.address.city ?? ""}, ${p.address.state ?? ""} ${p.address.zip ?? ""}`
                          : null
                      }
                    />
                    <Field k="Languages" v={p.languages?.join(", ") || null} />
                  </dl>
                ) : (
                  <Empty>Profile not filled in yet.</Empty>
                )}
              </Section>

              <Section title="Screening signals (enrich + flag only — never auto-reject)">
                {detail.signals.length === 0 ? (
                  <Empty>No screening yet (runs on submit).</Empty>
                ) : (
                  <ul className="space-y-2">
                    {detail.signals.map((s) => (
                      <li key={s.dimension} className="rounded-md border p-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{s.dimension}</span>
                          <Badge variant="outline">{s.state}</Badge>
                          {s.flag_for_review && (
                            <span className="inline-flex items-center gap-1 text-amber-600">
                              <Flag className="size-3.5" aria-hidden="true" />
                              review
                            </span>
                          )}
                          {s.confidence !== null && <span className="text-muted-foreground">conf {s.confidence}</span>}
                        </div>
                        <pre className="mt-1 overflow-x-auto rounded bg-muted/50 p-1.5 text-xs">
                          {JSON.stringify(s.provenance, null, 1)}
                        </pre>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section title="Verifications">
                {detail.verifications.length === 0 ? (
                  <Empty>None yet.</Empty>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {detail.verifications.map((v) => (
                      <Badge key={v.kind} variant="outline">
                        {v.kind}: {v.state} ({v.source})
                      </Badge>
                    ))}
                  </div>
                )}
              </Section>

              <Section title="Documents (private storage — masked)">
                {detail.documents.length === 0 ? (
                  <Empty>No documents.</Empty>
                ) : (
                  <ul className="space-y-1">
                    {detail.documents.map((d) => (
                      <li key={d.id} className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{d.kind}</span>
                        <Badge variant="outline">{d.status}</Badge>
                        {d.masked_number && <span className="font-mono text-muted-foreground">{d.masked_number}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section title="Consents">
                {detail.consents.length === 0 ? (
                  <Empty>None accepted.</Empty>
                ) : (
                  <ul className="space-y-0.5">
                    {detail.consents.map((c) => (
                      <li key={`${c.purpose}-${c.version}`}>
                        {c.purpose}{" "}
                        <span className="text-muted-foreground">
                          {c.version} · {fmt(c.accepted_at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section title="Audit timeline">
                <ol className="space-y-1">
                  {detail.events.map((e) => (
                    <li key={e.id} className="flex flex-wrap gap-x-2">
                      <span className="text-muted-foreground">{fmt(e.occurred_at)}</span>
                      <span className="font-medium">{e.event_type}</span>
                      {e.from_state || e.to_state ? (
                        <span>
                          {e.from_state ?? "—"} → {e.to_state ?? "—"}
                        </span>
                      ) : null}
                      <span className="text-muted-foreground">
                        by {e.actor} ({e.actor_type}){e.reason ? ` — ${e.reason}` : ""}
                      </span>
                    </li>
                  ))}
                </ol>
              </Section>
            </>
          )}
        </div>
      </SheetContent>

      <AlertDialog open={confirming} onOpenChange={(o) => !busy && setConfirming(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve {applicantKey}?</AlertDialogTitle>
            <AlertDialogDescription>
              Moves the applicant into the Approved Applicants pool and records you as the approver. This does not
              create a driver or give dispatch access.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (optional, goes in the audit trail)"
            maxLength={500}
            aria-label="Approval reason"
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button onClick={approve} disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              Approve
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Field({ k, v }: { k: string; v: string | null }) {
  return (
    <>
      <dt className="text-muted-foreground">{k}</dt>
      <dd>{v || "—"}</dd>
    </>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground">{children}</p>;
}
