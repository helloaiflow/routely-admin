"use client";

import { useCallback, useEffect, useState } from "react";

import {
  ChevronDown,
  CircleCheck,
  CircleX,
  Clock3,
  Copy,
  ExternalLink,
  Flag,
  History,
  Loader2,
  Phone,
  ShieldAlert,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

import type { ApplicantDetail } from "./_types";
import { fmt } from "./_types";
import { StatusBadge } from "./status-badge";

/* R29 — A03 rebuilt as a persistent center-column panel (Stops-style), replacing the Sheet
 * overlay. All the decision/requirements/background-check/consents business logic is unchanged
 * from the previous Sheet version -- only the shell (header/icon bar/stepper/tabs/collapsible
 * panels instead of one long scroll) is new.
 *
 * R29B: Requirements rows and Documents cards now call onSelectDoc() to open the Document
 * Visualizer (a sibling 3rd column, see document-visualizer.tsx) instead of window.open()'ing the
 * raw signed URL. */

const DOCUMENT_KIND_LABEL: Record<string, string> = {
  license_front: "License (front)",
  license_back: "License (back)",
  selfie: "Selfie",
  insurance: "Insurance",
  registration: "Registration",
};

const STAGES = ["Draft", "Profile", "Docs", "FCRA", "Review", "Check", "Approved"] as const;

function stageIndex(status: string, documentsUploaded: number, hasAuth: boolean, bgClear: boolean): number {
  if (status === "approved_applicant") return 6;
  if (status === "in_review" || status === "waitlisted") return bgClear ? 5 : 4;
  if (status === "rejected" || status === "withdrawn") return 4;
  if (hasAuth) return 3;
  if (documentsUploaded > 0) return 2; // docs in progress
  return 1; // profile-ish / draft
}

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

export function ApplicantDetailPanel({
  applicantKey,
  onClose,
  onChanged,
  onSelectDoc,
  onDocumentsLoaded,
  refreshToken,
}: {
  applicantKey: string | null;
  onClose: () => void;
  onChanged: () => void;
  /** R29B: opens a document in the Document Visualizer (3rd column) instead of a raw
   *  window.open() -- used by both the Requirements rows and the Documents tab. */
  onSelectDoc: (docId: string) => void;
  /** R29B: the Visualizer (a sibling column, not a child of this panel) needs this applicant's own
   *  documents array for its ‹ › navigation -- fired whenever a fresh detail loads. */
  onDocumentsLoaded: (documents: ApplicantDetail["documents"]) => void;
  /** R29C: bumped by a sibling (the Visualizer, after recording a "Same person?" decision) to make
   *  this panel reload WITHOUT resetting its own tab/scroll state (unlike the applicantKey-change
   *  effect below, which intentionally does reset everything for a genuinely new applicant). */
  refreshToken: number;
}) {
  const [detail, setDetail] = useState<ApplicantDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("review");

  const load = useCallback(
    async (key: string) => {
      try {
        const res = await fetch(`/api/client/driver-applicants/${encodeURIComponent(key)}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const next = (await res.json()) as ApplicantDetail;
        setDetail(next);
        setError(null);
        onDocumentsLoaded(next.documents);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      }
    },
    [onDocumentsLoaded],
  );

  useEffect(() => {
    setDetail(null);
    setError(null);
    setTab("review");
    onDocumentsLoaded([]);
    if (applicantKey) void load(applicantKey);
  }, [applicantKey, load, onDocumentsLoaded]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: only reload on refreshToken bumps, not on every load() identity change
  useEffect(() => {
    if (applicantKey && refreshToken > 0) void load(applicantKey);
  }, [refreshToken]);

  async function refresh() {
    if (applicantKey) await load(applicantKey);
    onChanged();
  }

  const a = detail?.applicant;
  const p = detail?.profile;
  const bg = detail?.background_check ?? null;
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

  if (!applicantKey) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        Select an application to see details.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="border-b p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm">{applicantKey}</span>
            {a && <StatusBadge status={a.status} />}
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              title="Copy reference"
              onClick={() => {
                navigator.clipboard.writeText(applicantKey);
                toast.success("Copied");
              }}
            >
              <Copy className="size-3.5" aria-hidden="true" />
            </Button>
            {p?.phone && (
              <Button type="button" variant="ghost" size="icon" className="size-7" title="Call" asChild>
                <a href={`tel:${p.phone}`}>
                  <Phone className="size-3.5" aria-hidden="true" />
                </a>
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              title="Jump to Activity"
              onClick={() => setTab("activity")}
            >
              <History className="size-3.5" aria-hidden="true" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="size-7" title="Close" onClick={onClose}>
              <X className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
        </div>
        {!detail && !error && <Skeleton className="mt-2 h-4 w-48" />}
        {p && (
          <p className="mt-1 truncate text-muted-foreground text-xs">
            {p.legal_name ?? "Unnamed"} · {p.operating_zones?.[0] ?? p.address?.city ?? "No zone"}
            {p.vehicle?.type ? ` · ${p.vehicle.type}` : ""}
          </p>
        )}
        {detail && (
          <div className="mt-2 flex items-center gap-1">
            {STAGES.map((label, i) => {
              const met = REQUIRED_DOCUMENT_KINDS.filter((rd) =>
                detail.documents.some(
                  (d) => d.kind === rd.kind && (d.status === "uploaded" || d.status === "verified"),
                ),
              ).length;
              const idx = stageIndex(a?.status ?? "draft", met, consentOk, bgClear);
              const done = i <= idx;
              return (
                <div key={label} className="flex flex-1 items-center gap-1">
                  <span
                    className={`size-1.5 shrink-0 rounded-full ${done ? "bg-primary" : "bg-muted-foreground/30"}`}
                  />
                  {i < STAGES.length - 1 && (
                    <span className={`h-px flex-1 ${done ? "bg-primary" : "bg-muted-foreground/20"}`} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {error && <p className="p-4 text-destructive text-sm">Could not load this applicant ({error}).</p>}

      {detail && a && (
        <>
          <Tabs value={tab} onValueChange={setTab} className="min-h-0 flex-1">
            <TabsList className="mx-3 mt-2 w-max">
              <TabsTrigger value="review" className="gap-1.5 text-xs">
                Review
              </TabsTrigger>
              <TabsTrigger value="documents" className="gap-1.5 text-xs">
                Documents
              </TabsTrigger>
              <TabsTrigger value="profile" className="gap-1.5 text-xs">
                Profile
              </TabsTrigger>
              <TabsTrigger value="activity" className="gap-1.5 text-xs">
                Activity
              </TabsTrigger>
            </TabsList>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              <TabsContent value="review" className="space-y-2">
                {a.status === "in_review" && !canApprove && (
                  <p className="flex items-start gap-1.5 rounded-md border border-amber-400/40 bg-amber-400/10 p-2 text-amber-600 text-xs dark:text-amber-400">
                    <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                    {!consentOk
                      ? "Authorization missing — can't run a background check yet"
                      : "Background check not yet clear — Approve is disabled until it is"}
                  </p>
                )}
                <Panel title="Requirements" defaultOpen>
                  <RequirementsChecklist detail={detail} onSelectDoc={onSelectDoc} />
                </Panel>
                <Panel
                  title="Background check (manual)"
                  subtitle={bg ? BACKGROUND_CHECK_STATUS_LABEL[bg.status] : "Not started"}
                >
                  <BackgroundCheckBlock applicantKey={applicantKey} current={bg} onRecorded={refresh} />
                </Panel>
                <Panel title="Consents" subtitle={`${detail.consents.length} accepted`}>
                  {detail.consents.length === 0 ? (
                    <Empty>No consents recorded.</Empty>
                  ) : (
                    <ul className="space-y-0.5">
                      {detail.consents.map((c) => (
                        <li key={c.purpose} className="flex items-center gap-2 text-xs">
                          <CircleCheck className="size-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
                          <span>{consentPurposeLabel(c.purpose)}</span>
                          <span className="text-muted-foreground">
                            {c.version} · {fmt(c.accepted_at)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
                <Panel title="Decision history" subtitle={`${detail.events.filter(isDecisionEvent).length} decisions`}>
                  {detail.events.filter(isDecisionEvent).length === 0 ? (
                    <Empty>No decisions recorded yet.</Empty>
                  ) : (
                    <ol className="space-y-1">
                      {detail.events.filter(isDecisionEvent).map((e) => (
                        <li key={e.id} className="text-xs">
                          <span className="text-muted-foreground">{fmt(e.occurred_at)}</span>{" "}
                          <span className="font-medium">{e.event_type}</span>{" "}
                          <span className="text-muted-foreground">
                            by {e.actor}
                            {e.reason ? ` — ${e.reason}` : ""}
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </Panel>
              </TabsContent>

              <TabsContent value="documents">
                <DocumentsList documents={detail.documents} onSelectDoc={onSelectDoc} />
              </TabsContent>

              <TabsContent value="profile" className="space-y-3">
                <Panel title="Personal" defaultOpen>
                  <dl className="grid grid-cols-[7rem_1fr] gap-y-1 text-xs">
                    <Field k="Name" v={p?.legal_name} />
                    <Field k="Date of birth" v={p?.dob} />
                    <Field k="Languages" v={p?.languages?.join(", ") || null} />
                  </dl>
                </Panel>
                <Panel title="Contact" defaultOpen>
                  <dl className="grid grid-cols-[7rem_1fr] gap-y-1 text-xs">
                    <Field k="Phone" v={p?.phone} />
                    <Field k="Email" v={p?.email} />
                  </dl>
                </Panel>
                <Panel title="Address">
                  <dl className="grid grid-cols-[7rem_1fr] gap-y-1 text-xs">
                    <Field
                      k="Address"
                      v={
                        p?.address
                          ? `${p.address.line1 ?? ""}, ${p.address.city ?? ""}, ${p.address.state ?? ""} ${p.address.zip ?? ""}`
                          : null
                      }
                    />
                  </dl>
                </Panel>
                <Panel title="Vehicle">
                  <dl className="grid grid-cols-[7rem_1fr] gap-y-1 text-xs">
                    <Field
                      k="Vehicle"
                      v={
                        p?.vehicle
                          ? `${p.vehicle.year ?? ""} ${p.vehicle.make ?? ""} ${p.vehicle.model ?? ""} (${p.vehicle.type ?? "—"})`.trim()
                          : null
                      }
                    />
                  </dl>
                </Panel>
                <Panel title="Zones">
                  <dl className="grid grid-cols-[7rem_1fr] gap-y-1 text-xs">
                    <Field k="Operating zones" v={p?.operating_zones?.join(", ") || null} />
                  </dl>
                </Panel>
                {detail.signals.length > 0 && (
                  <Panel title="Screening signals" subtitle={`${detail.signals.length}`}>
                    <ul className="space-y-2">
                      {detail.signals.map((s) => (
                        <li key={s.dimension} className="rounded-md border p-2 text-xs">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{s.dimension}</span>
                            <Badge variant="outline">{s.state}</Badge>
                            {s.flag_for_review && (
                              <span className="inline-flex items-center gap-1 text-amber-600">
                                <Flag className="size-3.5" aria-hidden="true" />
                                review
                              </span>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </Panel>
                )}
              </TabsContent>

              <TabsContent value="activity">
                <ol className="space-y-1.5">
                  {detail.events.map((e) => (
                    <li key={e.id} className="flex flex-wrap gap-x-2 text-xs">
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
              </TabsContent>
            </div>
          </Tabs>

          {/* Footer — decisions */}
          <div className="border-t p-3">
            <p className="mb-2 text-muted-foreground text-xs">
              {a.status !== "in_review"
                ? "Decisions are only available while an application is Under Review."
                : canApprove
                  ? "Ready to approve."
                  : !consentOk
                    ? "Next: get background-check authorization on file."
                    : "Next: record a clear background check result."}
            </p>
            <div className="flex items-center gap-2">
              <Button disabled={!canApprove} onClick={() => setApproveOpen(true)} className="gap-1.5">
                <CircleCheck className="size-4" aria-hidden="true" />
                Approve
              </Button>
              <Button variant="outline" disabled={!canDecide} onClick={() => setDecisionAction("waitlist")}>
                Waitlist
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" disabled={!canDecide} className="gap-1">
                    More <ChevronDown className="size-3.5" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setDecisionAction("request-changes")}>
                    <Clock3 className="size-3.5" aria-hidden="true" />
                    Request changes
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setDecisionAction("reject")} className="text-destructive">
                    <CircleX className="size-3.5" aria-hidden="true" />
                    Reject
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </>
      )}

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

      <DecisionDialog
        action={decisionAction}
        applicantKey={applicantKey}
        onClose={() => setDecisionAction(null)}
        onDone={refresh}
      />
    </div>
  );
}

function isDecisionEvent(e: { event_type: string }): boolean {
  return /approve|waitlist|reject|request_changes|request-changes/i.test(e.event_type);
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
        { reason_code: reasonCode, note },
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

function RequirementsChecklist({
  detail,
  onSelectDoc,
}: {
  detail: ApplicantDetail;
  onSelectDoc: (docId: string) => void;
}) {
  const hasAuth = detail.consents.some((c) =>
    (BACKGROUND_CHECK_CONSENT_PURPOSES as readonly string[]).includes(c.purpose),
  );
  const items = [
    ...REQUIRED_DOCUMENT_KINDS.map((rd) => {
      const doc = detail.documents.find((d) => d.kind === rd.kind);
      const ok = doc?.status === "uploaded" || doc?.status === "verified";
      const viewable =
        Boolean(doc) && (doc?.status === "uploaded" || doc?.status === "verified" || doc?.status === "needs_review");
      return { label: rd.label, ok, note: doc?.status ?? "missing", docId: viewable ? doc?.id : undefined };
    }),
    { label: "Background check authorization", ok: hasAuth, note: hasAuth ? "on file" : "missing", docId: undefined },
    {
      label: "Background check result",
      ok: detail.background_check?.status === "clear",
      note: detail.background_check ? BACKGROUND_CHECK_STATUS_LABEL[detail.background_check.status] : "not started",
      docId: undefined,
    },
  ];
  return (
    <ul className="space-y-1">
      {items.map((it) => (
        <li key={it.label}>
          <button
            type="button"
            disabled={!it.docId}
            onClick={it.docId ? () => onSelectDoc(it.docId as string) : undefined}
            className="flex w-full items-center gap-2 rounded text-left text-xs enabled:cursor-pointer enabled:hover:bg-muted/40 disabled:cursor-default"
          >
            {it.ok ? (
              <CircleCheck className="size-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
            ) : (
              <CircleX className="size-3.5 shrink-0 text-amber-500" aria-hidden="true" />
            )}
            <span>{it.label}</span>
            <span className="text-muted-foreground">({it.note})</span>
            {it.docId && <ChevronDown className="ml-auto size-3 shrink-0 rotate-[-90deg] text-muted-foreground" />}
          </button>
        </li>
      ))}
    </ul>
  );
}

function DocumentsList({
  documents,
  onSelectDoc,
}: {
  documents: ApplicantDetail["documents"];
  onSelectDoc: (docId: string) => void;
}) {
  if (documents.length === 0) return <Empty>No documents yet.</Empty>;
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {documents.map((d) => {
        const viewable = d.status === "uploaded" || d.status === "verified" || d.status === "needs_review";
        return (
          <button
            key={d.id}
            type="button"
            disabled={!viewable}
            onClick={() => onSelectDoc(d.id)}
            className="flex items-center justify-between gap-2 rounded-md border p-2.5 text-left text-xs hover:bg-muted/40 disabled:opacity-60"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{DOCUMENT_KIND_LABEL[d.kind] ?? d.kind}</p>
              <p className="text-muted-foreground">
                {d.content_type ?? "unknown format"}
                {d.masked_number ? ` · ${d.masked_number}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Badge variant="outline" className="text-[10px]">
                {d.status}
              </Badge>
              {viewable && <ExternalLink className="size-3.5 text-muted-foreground" aria-hidden="true" />}
            </div>
          </button>
        );
      })}
    </div>
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
      <div className="rounded-md border p-2 text-xs">
        <p className="text-muted-foreground">Last recorded</p>
        {current ? (
          <p>
            <Badge variant={current.status === "clear" ? "default" : "outline"}>
              {BACKGROUND_CHECK_STATUS_LABEL[current.status]}
            </Badge>{" "}
            {current.date && <span>on {current.date} </span>}
            {current.actor && <span className="text-muted-foreground">by {current.actor} </span>}
            {current.external_reference && (
              <span className="font-mono text-muted-foreground">ref: {current.external_reference}</span>
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

function Panel({
  title,
  subtitle,
  defaultOpen,
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-md border">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 p-2.5 text-left">
        <span className="font-medium text-xs">{title}</span>
        <div className="flex items-center gap-2">
          {subtitle && <span className="text-muted-foreground text-xs">{subtitle}</span>}
          <ChevronDown className={`size-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t p-2.5 pt-2">{children}</CollapsibleContent>
    </Collapsible>
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
  return <p className="text-muted-foreground text-xs">{children}</p>;
}
