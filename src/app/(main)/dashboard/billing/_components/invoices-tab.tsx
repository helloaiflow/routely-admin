"use client";

import { useEffect, useState } from "react";

import { Download, FileText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";

type DocRow = {
  id: number;
  document_number: string;
  doc_type: "receipt" | "statement" | "invoice";
  status: string;
  cycle_start: string | null;
  cycle_end: string | null;
  amount_cents: number;
  amount_paid_cents: number;
  due_date: string | null;
  stripe_invoice_id: string | null;
  created_at: string;
  paid_at: string | null;
  voided_at: string | null;
};

type DocDetail = DocRow & {
  snapshot: {
    items?: Array<{ description?: string; type?: string; units?: number; amount_cents: number }>;
    statement_note?: string;
    period_note?: string | null;
    is_first_close?: boolean;
    prior_period_cents?: number;
  };
  ledger_lines: Array<{ id: number; stop_id: string; resolved_type: string; amount_cents: number }>;
  adjustments: Array<{ id: number; adjustment_type: string; amount_cents: number; reason: string; created_at: string }>;
};

const DOC_LABEL: Record<string, string> = { receipt: "Receipt", statement: "Statement", invoice: "Invoice" };
const STATUS_TONE: Record<string, string> = {
  paid: "bg-success/10 text-success",
  open: "bg-primary/10 text-primary",
  past_due: "bg-destructive/10 text-destructive",
  voided: "bg-muted text-muted-foreground",
  refunded: "bg-muted text-muted-foreground",
  failed: "bg-destructive/10 text-destructive",
  pending: "bg-muted text-muted-foreground",
  draft: "bg-muted text-muted-foreground",
};
const centsToUsd = (c: number) => `$${(c / 100).toFixed(2)}`;

export function InvoicesTab() {
  const [rows, setRows] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [docType, setDocType] = useState("all");
  const [status, setStatus] = useState("all");
  const [detail, setDetail] = useState<DocDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "50" });
    if (docType !== "all") params.set("doc_type", docType);
    if (status !== "all") params.set("status", status);
    fetch(`/api/client/billing/documents?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => setRows(d.rows ?? []))
      .catch(() => {
        /* best-effort — empty list + no error state is an acceptable degrade */
      })
      .finally(() => setLoading(false));
  }, [docType, status]);

  async function openDetail(id: number) {
    setDetailLoading(true);
    try {
      const r = await fetch(`/api/client/billing/documents/${id}`);
      setDetail(await r.json());
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 py-3">
          <Select value={docType} onValueChange={setDocType}>
            <SelectTrigger className="h-8 w-[150px] text-13">
              <SelectValue placeholder="Document type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All documents</SelectItem>
              <SelectItem value="receipt">Receipts</SelectItem>
              <SelectItem value="statement">Statements</SelectItem>
              <SelectItem value="invoice">Invoices</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-8 w-[140px] text-13">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="past_due">Past due</SelectItem>
              <SelectItem value="voided">Voided</SelectItem>
              <SelectItem value="refunded">Refunded</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="divide-y divide-border/60 p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={`d-${i}`} className="h-12 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-8 text-center">
              <FileText className="size-8 text-muted-foreground" />
              <p className="text-muted-foreground text-13">
                No documents yet — receipts appear after a label checkout, statements/invoices after a billing cycle
                closes.
              </p>
            </div>
          ) : (
            rows.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => openDetail(d.id)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-medium text-13">{d.document_number}</span>
                  <span className="text-11 text-muted-foreground">
                    {DOC_LABEL[d.doc_type]} · {new Date(d.created_at).toLocaleDateString()}
                    {d.due_date ? ` · Due ${new Date(d.due_date).toLocaleDateString()}` : ""}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-10 ${STATUS_TONE[d.status] ?? "bg-muted"}`}>
                    {d.status.replace("_", " ")}
                  </span>
                  <span className="w-16 text-right font-medium tabular-nums">{centsToUsd(d.amount_cents)}</span>
                </div>
              </button>
            ))
          )}
        </CardContent>
      </Card>

      <Sheet open={!!detail || detailLoading} onOpenChange={(open) => !open && setDetail(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{detail ? detail.document_number : "Loading…"}</SheetTitle>
            <SheetDescription className="sr-only">Full document detail, line items, and PDF download</SheetDescription>
          </SheetHeader>
          {detailLoading && !detail && <Skeleton className="mx-4 h-40" />}
          {detail && (
            <div className="space-y-4 px-4 pb-6">
              <div className="flex items-center justify-between">
                <span className="text-13 text-muted-foreground">{DOC_LABEL[detail.doc_type]}</span>
                <span className={`rounded-full px-2 py-0.5 text-10 ${STATUS_TONE[detail.status] ?? "bg-muted"}`}>
                  {detail.status.replace("_", " ")}
                </span>
              </div>

              {detail.cycle_start && (
                <p className="text-11 text-muted-foreground">
                  Billing period: {new Date(detail.cycle_start).toLocaleDateString()} –{" "}
                  {detail.cycle_end ? new Date(detail.cycle_end).toLocaleDateString() : "—"}
                </p>
              )}

              {detail.snapshot?.statement_note && (
                <p className="rounded-lg bg-success/10 px-3 py-2 text-13 text-success">
                  {detail.snapshot.statement_note}
                </p>
              )}

              {detail.snapshot?.period_note && (
                <p className="rounded-lg bg-warning/10 px-3 py-2 text-13 text-warning">{detail.snapshot.period_note}</p>
              )}

              <div className="space-y-1">
                {(detail.snapshot?.items ?? []).map((item, i) => (
                  <div key={`item-${i}-${item.description}`} className="flex items-center justify-between text-13">
                    <span className="text-muted-foreground">{item.description ?? item.type}</span>
                    <span className="tabular-nums">{centsToUsd(item.amount_cents)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between border-border/60 border-t pt-2 font-semibold text-13">
                  <span>Total</span>
                  <span className="tabular-nums">{centsToUsd(detail.amount_cents)}</span>
                </div>
                {detail.amount_paid_cents > 0 && (
                  <div className="flex items-center justify-between text-13 text-success">
                    <span>Paid</span>
                    <span className="tabular-nums">{centsToUsd(detail.amount_paid_cents)}</span>
                  </div>
                )}
              </div>

              {detail.adjustments.length > 0 && (
                <div className="space-y-1 border-border/60 border-t pt-3">
                  <p className="text-11 text-muted-foreground uppercase tracking-wide">Adjustments</p>
                  {detail.adjustments.map((a) => (
                    <div key={a.id} className="flex items-center justify-between text-13">
                      <span className="text-muted-foreground">
                        {a.adjustment_type} — {a.reason}
                      </span>
                      <span className="tabular-nums">{centsToUsd(a.amount_cents)}</span>
                    </div>
                  ))}
                </div>
              )}

              {detail.stripe_invoice_id && (
                <p className="text-11 text-muted-foreground">Stripe reference: {detail.stripe_invoice_id}</p>
              )}

              <Button asChild className="w-full gap-1.5">
                <a href={`/api/client/billing/documents/${detail.id}/pdf`} target="_blank" rel="noreferrer">
                  <Download className="size-3.5" /> Download PDF
                </a>
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
