"use client";

import { useEffect, useState } from "react";

import { ArrowLeft, FileText, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { type DateRange, DateRangePicker } from "@/components/ui/date-range-picker";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatCurrencyCents as centsToUsd } from "@/lib/ui/format";
import { cn } from "@/lib/utils";

import { InvoiceDetail } from "./invoice-detail";

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
  created_at: string;
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
const toISODate = (d: Date) => d.toISOString().slice(0, 10);

/* Invoices — two-column list+detail (Section 2). Kept independent from
 * useBillingFilters/BillingFilterBar on purpose: document type/status
 * vocabulary (receipt/statement/invoice, open/paid/past_due/…) is a
 * different domain than charge type/status, and Charges + Recent Activity
 * already intentionally SHARE their URL params across tab switches — reusing
 * the same param names here would leak an unrelated filter value across
 * tabs. Local component state instead; still backed by the same
 * search/date_from/date_to/amount_min/amount_max params the backend added
 * for get_documents. */
export function InvoicesTab() {
  const isMobile = useIsMobile();
  const [rows, setRows] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);

  const [search, setSearch] = useState("");
  const [docType, setDocType] = useState("all");
  const [status, setStatus] = useState("all");
  const [paymentStatus, setPaymentStatus] = useState("all");
  const [dateRange, setDateRange] = useState<DateRange | null>(null);
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");

  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    setErrored(false);
    const params = new URLSearchParams({ limit: "50" });
    if (docType !== "all") params.set("doc_type", docType);
    if (status !== "all") params.set("status", status);
    if (search.trim()) params.set("search", search.trim());
    if (dateRange?.from) params.set("date_from", toISODate(dateRange.from));
    if (dateRange?.to) params.set("date_to", toISODate(dateRange.to));
    const minCents = Math.round(Number(amountMin) * 100);
    const maxCents = Math.round(Number(amountMax) * 100);
    if (amountMin && Number.isFinite(minCents)) params.set("amount_min", String(minCents));
    if (amountMax && Number.isFinite(maxCents)) params.set("amount_max", String(maxCents));
    fetch(`/api/client/billing/documents?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => setRows(d.rows ?? []))
      .catch(() => setErrored(true))
      .finally(() => setLoading(false));
  }, [docType, status, search, dateRange, amountMin, amountMax]);

  // Payment status has no dedicated backend filter — it's derivable from
  // amount_cents/amount_paid_cents on the already-fetched (capped) page, so
  // it's filtered client-side rather than adding a redundant server param.
  const visibleRows = rows.filter((d) => {
    if (paymentStatus === "all") return true;
    const balanceDue = Math.max(0, d.amount_cents - d.amount_paid_cents);
    return paymentStatus === "balance_due" ? balanceDue > 0 : balanceDue === 0;
  });

  const isFiltered =
    search !== "" ||
    docType !== "all" ||
    status !== "all" ||
    paymentStatus !== "all" ||
    !!dateRange ||
    amountMin !== "" ||
    amountMax !== "";
  function clearFilters() {
    setSearch("");
    setDocType("all");
    setStatus("all");
    setPaymentStatus("all");
    setDateRange(null);
    setAmountMin("");
    setAmountMax("");
  }

  const list = (
    <Card className="flex h-full flex-col overflow-hidden">
      <CardContent className="space-y-2 border-border/60 border-b py-3">
        <div className="relative">
          <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search document number"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 text-13"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={docType} onValueChange={setDocType}>
            <SelectTrigger className="h-8 w-[128px] text-13">
              <SelectValue placeholder="Document type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="receipt">Receipts</SelectItem>
              <SelectItem value="statement">Statements</SelectItem>
              <SelectItem value="invoice">Invoices</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-8 w-[120px] text-13">
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
          <Select value={paymentStatus} onValueChange={setPaymentStatus}>
            <SelectTrigger className="h-8 w-[122px] text-13">
              <SelectValue placeholder="Payment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any payment</SelectItem>
              <SelectItem value="balance_due">Balance due</SelectItem>
              <SelectItem value="paid_in_full">Paid in full</SelectItem>
            </SelectContent>
          </Select>
          <DateRangePicker
            value={dateRange ?? { from: new Date(), to: new Date(), label: "Any date" }}
            onChange={setDateRange}
          />
          <Input
            placeholder="Min $"
            inputMode="decimal"
            value={amountMin}
            onChange={(e) => setAmountMin(e.target.value)}
            className="h-8 w-20 text-13"
          />
          <Input
            placeholder="Max $"
            inputMode="decimal"
            value={amountMax}
            onChange={(e) => setAmountMax(e.target.value)}
            className="h-8 w-20 text-13"
          />
          {isFiltered && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1 text-11 text-muted-foreground"
              onClick={clearFilters}
            >
              <X className="size-3" /> Clear
            </Button>
          )}
        </div>
      </CardContent>

      <div className="flex-1 divide-y divide-border/60 overflow-y-auto">
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton count, list never reorders
              <Skeleton key={`d-${i}`} className="h-12 w-full" />
            ))}
          </div>
        ) : errored ? (
          <p className="p-6 text-center text-13 text-muted-foreground">Couldn't load documents.</p>
        ) : visibleRows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center">
            <FileText className="size-8 text-muted-foreground" />
            <p className="text-13 text-muted-foreground">
              {isFiltered
                ? "No documents match these filters."
                : "No documents yet — receipts appear after a label checkout, statements/invoices after a billing cycle closes."}
            </p>
          </div>
        ) : (
          visibleRows.map((d) => {
            const balanceDue = Math.max(0, d.amount_cents - d.amount_paid_cents);
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => setSelectedId(d.id)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50",
                  selectedId === d.id && "bg-primary/5",
                )}
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex items-center gap-1.5 font-medium text-13">
                    {d.document_number}
                    {selectedId === d.id && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}
                  </span>
                  <span className="text-11 text-muted-foreground">
                    {DOC_LABEL[d.doc_type]}
                    {d.cycle_start ? ` · ${new Date(d.cycle_start).toLocaleDateString()}` : ""}
                  </span>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5">
                  <span className={cn("rounded-full px-2 py-0.5 text-10", STATUS_TONE[d.status] ?? "bg-muted")}>
                    {d.status.replace(/_/g, " ")}
                  </span>
                  <span className="text-right font-medium text-13 tabular-nums">{centsToUsd(d.amount_cents)}</span>
                  {balanceDue > 0 && (
                    <span className="text-10 text-warning tabular-nums">{centsToUsd(balanceDue)} due</span>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </Card>
  );

  const detail = selectedId ? (
    <Card className="h-full overflow-y-auto">
      <InvoiceDetail documentId={selectedId} />
    </Card>
  ) : (
    <Card className="flex h-full items-center justify-center">
      <p className="text-13 text-muted-foreground">Select a document to view its detail.</p>
    </Card>
  );

  if (isMobile) {
    return selectedId ? (
      <div className="space-y-2">
        <Button size="sm" variant="ghost" className="gap-1.5 text-13" onClick={() => setSelectedId(null)}>
          <ArrowLeft className="size-3.5" /> Back to documents
        </Button>
        {detail}
      </div>
    ) : (
      list
    );
  }

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[380px_1fr]">
      {list}
      {detail}
    </div>
  );
}
