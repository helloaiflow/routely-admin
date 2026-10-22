"use client";

import { useCallback, useEffect, useState } from "react";

import { CircleCheck, CircleX, Clock3, ExternalLink, Flag, Loader2, PauseCircle, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  BACKGROUND_CHECK_CONSENT_PURPOSES,
  BACKGROUND_CHECK_STATUS_LABEL,
  BACKGROUND_CHECK_STATUSES,
  consentPurposeLabel,
  REASON_CODE_LABEL,
  REJECT_REASON_CODES,
  REQUEST_CHANGES_REASON_CODES,
  REQUIRED_DOCUMENT_KINDS,
  WAITLIST_REASON_CODES,
} from "@/lib/driver-applicants";

import { type ApplicantDetail, fmt } from "./_types";
import { StatusBadge } from "./status-badge";

/* A03 — Detail. Rebuilt per the 2026-10-22 mission spec: masked phone (the
 * server already masks it — see the detail route), a requirements checklist
 * built from REAL document/consent/verification status (not a static list),
 * documents viewed only via the audited signed-URL proxy (never a direct
 * link), the 4-decision panel with real reason_code enums, and the
 * Background check (manual) block. Intentionally NOT a port of the skeleton's
 * detail section or the design board PNG. */

const DOCUMENT_KIND_LABEL: Record<string, string> = {
  license_front: "License (front)",
  license_back: "License (back)",
  selfie: "Selfie",
  insurance: "Insurance",
  registration: "Registration",
};

type DecisionAction = "waitlist" | "reject" | "request-changes";

const DECISION_CONFIG: Record<
  DecisionAction,
  { title: string; description: string; reasonCodes: readonly string[]; success: string }
> = {
  waitlist: {
    title: "Waitlist applicant",
    description: "Moves the applicant to Waitlisted. They can be brought back into review later.",
    reasonCodes: WAITLIST_REASON_CODES,
    success: "waitlisted",
  },
  reject: {
    title: "Reject applicant",
    description: "Moves the applicant to Rejected. This is a terminal decision.",
    reasonCodes: REJECT_REASON_CODES,
    success: "rejected",
  },
  "request-changes": {
    title: "Request changes",
    description: "Returns the applicant to Onboarding so they can redo the flagged item.",
    reasonCodes: REQUEST_CHANGES_REASON_CODES,
    success: "sent back for changes",
  },
};

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, data };
}

function apiErrorMessage(data: Record<string, unknown>, fallback: string): string {
  const detail = data.detail as { message?: string } | undefined;
  return (detail?.message as string) ?? (data.message as string) ?? (data.error as string) ?? fallback;
}

export function ApplicantDetailSheet({
  applicantKey,
  onClose,
  onChanged,
}: {
  applicantKey: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<ApplicantDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (key: string) => {
    try {
      const res = await fetch(`/api/client/driver-applicants/${encodeURIComponent(key)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDetail((await res.json()) as ApplicantDetail);
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

  async function refresh() {
    if (applicantKey) await load(applicantKey);
    onChanged();
  }

  const a = detail?.applicant;
  const p = detail?.profile;
  const bg = detail?.background_check ?? null;
  // R28 point 1: accept EITHER real-world purpose string the backend's own approve() gate does
  // (background_check legacy, or background_check_authorization from routely-driver's migration
  // 0062) — this used to check 'background_check' alone, which no real applicant in this flow
  // actually has, permanently blocking Approve even once the real requirement was satisfied.
  const consentOk =
    detail?.consents.some((c) => (BACKGROUND_CHECK_CONSENT_PURPOSES as readonly string[]).includes(c.purpose)) ?? false;
  const bgClear = bg?.status === "clear";
  const canApprove = a?.status === "in_review" && consentOk && bgClear;
  const canDecide = a?.status === "in_review";

  const [approveOpen, setApproveOpen] = useState(false);
  const [approveReason, setApproveReason] = useState("");
  const [decisionAction, setDecisionAction] = useState<DecisionAction | null>(null);

  async function approve() {
    if (!applicantKey) return;
    setBusy(true);
    try {
      const { ok, data } = await postJson(`/api/client/driver-applicants/${encodeURIComponent(applicantKey)}/approve`, {
        reason: approveReason,
      });
      if (!ok) throw new Error(apiErrorMessage(data, "Approve failed"));
      toast.success(`${applicantKey} approved — added to the pool`);
      setApproveOpen(false);
      setApproveReason("");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={applicantKey !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 font-mono">
            {applicantKey}
            {a && <StatusBadge status={a.status} />}
          </SheetTitle>
          <SheetDescription>
            {p ? (
              <>
                {p.legal_name ?? "Unnamed"} · {p.operating_zones?.[0] ?? p.address?.city ?? "No zone"} · Phone:{" "}
                <span className="font-mono">{p.phone ?? "—"}</span>
              </>
            ) : (
              " "
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-6 text-sm">
          {error && <p className="text-destructive">Could not load this applicant ({error}).</p>}
          {!detail && !error && <Skeleton className="h-40 w-full" />}
          {detail && a && (
            <>
              {/* Decision panel */}
              <Section title="Decision">
                <div className="flex flex-wrap gap-2">
                  <Button disabled={!canApprove} onClick={() => setApproveOpen(true)}>
                    <CircleCheck className="size-4" aria-hidden="true" />
                    Approve
                  </Button>
                  <Button variant="outline" disabled={!canDecide} onClick={() => setDecisionAction("waitlist")}>
                    <PauseCircle className="size-4" aria-hidden="true" />
                    Waitlist
                  </Button>
                  <Button variant="outline" disabled={!canDecide} onClick={() => setDecisionAction("request-changes")}>
                    <Clock3 className="size-4" aria-hidden="true" />
                    Request changes
                  </Button>
                  <Button variant="outline" disabled={!canDecide} onClick={() => setDecisionAction("reject")}>
                    <CircleX className="size-4" aria-hidden="true" />
                    Reject
                  </Button>
                </div>
                {a.status === "in_review" && !canApprove && (
                  <p className="mt-2 flex items-start gap-1.5 text-amber-600 text-xs dark:text-amber-400">
                    <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                    {!consentOk
                      ? "Authorization missing — can't run a background check yet"
                      : "Background check not yet clear — Approve is disabled until it is"}
                  </p>
                )}
                {a.status !== "in_review" && (
                  <p className="mt-2 text-muted-foreground text-xs">
                    Decisions are only available while an application is Under Review.
                  </p>
                )}
              </Section>

              <Section title="Requirements checklist">
                <RequirementsChecklist detail={detail} />
              </Section>

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
                    <Field k="Zone(s)" v={p.operating_zones?.join(", ") || null} />
                    <Field
                      k="Vehicle"
                      v={
                        p.vehicle
                          ? `${p.vehicle.year ?? ""} ${p.vehicle.make ?? ""} ${p.vehicle.model ?? ""} (${p.vehicle.type ?? "—"})`.trim()
                          : null
                      }
                    />
                    <Field k="Languages" v={p.languages?.join(", ") || null} />
                  </dl>
                ) : (
                  <Empty>Profile not filled in yet.</Empty>
                )}
              </Section>

              <Section title="Documents (private storage — view via audited signed URL only)">
                <DocumentsList applicantKey={applicantKey} documents={detail.documents} />
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

              <Section title="Consents">
                {/* R28 point 1: renders every REAL consent row this applicant actually has, not a
                 * fixed M1 subset — the admin used to check for purpose names (terms_of_service,
                 * privacy_policy...) that real applicants (M2/M3 funnels, the driver app) never
                 * write, so every real consent showed as "not accepted" even when it was. */}
                {detail.consents.length === 0 ? (
                  <Empty>No consents recorded.</Empty>
                ) : (
                  <ul className="space-y-0.5">
                    {detail.consents.map((c) => (
                      <li key={c.purpose} className="flex items-center gap-2">
                        <CircleCheck className="size-3.5 text-emerald-600" aria-hidden="true" />
                        <span>{consentPurposeLabel(c.purpose)}</span>
                        <span className="text-muted-foreground text-xs">
                          {c.version} · {fmt(c.accepted_at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section title="Background check (manual)">
                <BackgroundCheckBlock applicantKey={applicantKey} current={bg} onRecorded={refresh} />
              </Section>

              <Section title="Event timeline">
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

      {/* Approve confirmation */}
      <Dialog open={approveOpen} onOpenChange={(o) => !busy && setApproveOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve {applicantKey}?</DialogTitle>
            <DialogDescription>
              Moves the applicant into the Approved Applicants pool and records you as the approver. This does not
              create a driver or give dispatch access.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={approveReason}
            onChange={(e) => setApproveReason(e.target.value)}
            placeholder="Reason (optional, goes in the audit trail)"
            maxLength={500}
            aria-label="Approval reason"
          />
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setApproveOpen(false)}>
              Cancel
            </Button>
            <Button onClick={approve} disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Waitlist / Reject / Request-changes confirmation */}
      <DecisionDialog
        action={decisionAction}
        applicantKey={applicantKey}
        onClose={() => setDecisionAction(null)}
        onDone={refresh}
      />
    </Sheet>
  );
}

function DecisionDialog({
  action,
  applicantKey,
  onClose,
  onDone,
}: {
  action: DecisionAction | null;
  applicantKey: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reasonCode, setReasonCode] = useState<string>("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: resets the form whenever a new action is opened
  useEffect(() => {
    setReasonCode("");
    setNote("");
  }, [action]);

  if (!action) return null;
  const cfg = DECISION_CONFIG[action];

  async function submit() {
    if (!applicantKey || !action) return;
    if (!reasonCode) {
      toast.error("Pick a reason");
      return;
    }
    setBusy(true);
    try {
      const { ok, data } = await postJson(
        `/api/client/driver-applicants/${encodeURIComponent(applicantKey)}/${action}`,
        {
          reason_code: reasonCode,
          note,
        },
      );
      if (!ok) throw new Error(apiErrorMessage(data, `${action} failed`));
      toast.success(`${applicantKey} ${cfg.success}`);
      onClose();
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `${action} failed`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={action !== null} onOpenChange={(o) => !busy && !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{cfg.title}</DialogTitle>
          <DialogDescription>{cfg.description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-muted-foreground text-xs" htmlFor="reason_code">
              Reason
            </label>
            <Select value={reasonCode} onValueChange={setReasonCode}>
              <SelectTrigger id="reason_code" className="w-full">
                <SelectValue placeholder="Select a reason" />
              </SelectTrigger>
              <SelectContent>
                {cfg.reasonCodes.map((code) => (
                  <SelectItem key={code} value={code}>
                    {REASON_CODE_LABEL[code] ?? code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional, goes in the audit trail)"
            maxLength={500}
            aria-label="Note"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !reasonCode}>
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RequirementsChecklist({ detail }: { detail: ApplicantDetail }) {
  // R28 point 2: the full document checklist per the real contract — was missing insurance and
  // registration entirely (only ever showed license front/back + selfie).
  const hasAuth = detail.consents.some((c) =>
    (BACKGROUND_CHECK_CONSENT_PURPOSES as readonly string[]).includes(c.purpose),
  );
  const items = [
    ...REQUIRED_DOCUMENT_KINDS.map((rd) => {
      const doc = detail.documents.find((d) => d.kind === rd.kind);
      const ok = doc?.status === "uploaded" || doc?.status === "verified";
      return { label: rd.label, ok, note: doc?.status ?? "missing" };
    }),
    {
      label: "Background check authorization",
      ok: hasAuth,
      note: hasAuth ? "on file" : "missing",
    },
    {
      label: "Background check result",
      ok: detail.background_check?.status === "clear",
      note: detail.background_check ? BACKGROUND_CHECK_STATUS_LABEL[detail.background_check.status] : "not started",
    },
    ...detail.verifications.map((v) => ({
      label: `Verification: ${v.kind}`,
      ok: v.state === "verified" || v.state === "clear",
      note: v.state,
    })),
  ];
  return (
    <ul className="space-y-1">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-2">
          {it.ok ? (
            <CircleCheck className="size-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
          ) : (
            <CircleX className="size-3.5 shrink-0 text-amber-500" aria-hidden="true" />
          )}
          <span>{it.label}</span>
          <span className="text-muted-foreground text-xs">({it.note})</span>
        </li>
      ))}
    </ul>
  );
}

function DocumentsList({
  applicantKey,
  documents,
}: {
  applicantKey: string | null;
  documents: ApplicantDetail["documents"];
}) {
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function view(docId: string) {
    if (!applicantKey) return;
    setLoadingId(docId);
    try {
      const res = await fetch(
        `/api/client/driver-applicants/${encodeURIComponent(applicantKey)}/documents/${encodeURIComponent(docId)}/url`,
      );
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) throw new Error(apiErrorMessage(data, "Could not get a viewing link"));
      const url = data.url as string | undefined;
      if (!url) throw new Error("No URL returned");
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open document");
    } finally {
      setLoadingId(null);
    }
  }

  if (documents.length === 0) return <Empty>No documents.</Empty>;
  return (
    <ul className="space-y-1">
      {documents.map((d) => {
        const viewable = d.status === "uploaded" || d.status === "verified" || d.status === "needs_review";
        return (
          <li key={d.id} className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{DOCUMENT_KIND_LABEL[d.kind] ?? d.kind}</span>
            <Badge variant="outline">{d.status}</Badge>
            {d.masked_number && <span className="font-mono text-muted-foreground">{d.masked_number}</span>}
            {viewable && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 gap-1 px-1.5 text-xs"
                disabled={loadingId === d.id}
                onClick={() => view(d.id)}
              >
                {loadingId === d.id ? (
                  <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                ) : (
                  <ExternalLink className="size-3" aria-hidden="true" />
                )}
                View (signed, short-lived)
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function BackgroundCheckBlock({
  applicantKey,
  current,
  onRecorded,
}: {
  applicantKey: string | null;
  current: ApplicantDetail["background_check"];
  onRecorded: () => void;
}) {
  const [status, setStatus] = useState<string>("requested");
  const [date, setDate] = useState("");
  const [externalRef, setExternalRef] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!applicantKey) return;
    setBusy(true);
    try {
      const { ok, data } = await postJson(
        `/api/client/driver-applicants/${encodeURIComponent(applicantKey)}/background-check`,
        { status, date: date || undefined, external_reference: externalRef || undefined },
      );
      if (!ok) throw new Error(apiErrorMessage(data, "Could not record background check"));
      toast.success("Background check recorded");
      setDate("");
      setExternalRef("");
      onRecorded();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record background check");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border p-2">
        <p className="text-muted-foreground text-xs">Last recorded</p>
        {current ? (
          <p>
            <Badge variant={current.status === "clear" ? "default" : "outline"}>
              {BACKGROUND_CHECK_STATUS_LABEL[current.status]}
            </Badge>{" "}
            {current.date && <span>on {current.date} </span>}
            {current.actor && <span className="text-muted-foreground">by {current.actor} </span>}
            {current.external_reference && (
              <span className="font-mono text-muted-foreground text-xs">ref: {current.external_reference}</span>
            )}
          </p>
        ) : (
          <p>
            <Badge variant="outline">{BACKGROUND_CHECK_STATUS_LABEL.not_started}</Badge>
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger aria-label="New background check status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BACKGROUND_CHECK_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {BACKGROUND_CHECK_STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-9 rounded-md border bg-transparent px-3 text-sm"
          aria-label="Background check date"
        />
        <input
          type="text"
          value={externalRef}
          onChange={(e) => setExternalRef(e.target.value)}
          placeholder="External reference (optional)"
          maxLength={200}
          className="h-9 rounded-md border bg-transparent px-3 text-sm"
          aria-label="External reference"
        />
      </div>
      <p className="text-[11px] text-muted-foreground">
        Status + date + a reference string only — the actual report is never uploaded or stored here.
      </p>
      <Button size="sm" disabled={busy} onClick={submit}>
        {busy && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
        Record background check
      </Button>
    </div>
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

function Field({ k, v }: { k: string; v: string | null | undefined }) {
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
