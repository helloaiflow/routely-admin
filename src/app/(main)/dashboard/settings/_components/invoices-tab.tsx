"use client";

import { useEffect, useMemo, useState } from "react";

import { CreditCard, Download, FileText, Info, Loader2, Printer } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { type BillingCharges, type BillTo, type ChargeRow, money } from "./settings-types";

type Invoice = {
  id: string;
  number: string;
  periodLabel: string;
  issueISO: string;
  dueISO: string;
  status: "paid" | "due";
  items: ChargeRow[];
  subtotal: number;
  total: number;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function buildInvoices(charges: ChargeRow[]): Invoice[] {
  const groups = new Map<string, ChargeRow[]>();
  for (const c of charges) {
    const d = new Date(c.date);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(c);
  }
  const out: Invoice[] = [];
  for (const [key, items] of groups) {
    const [y, mo] = key.split("-").map(Number);
    const total = Math.round(items.reduce((a, b) => a + (b.amount || 0), 0) * 100) / 100;
    const due = items.some((i) => i.status === "pending_payment");
    const issue = new Date(y, mo, 0); // last day of the month
    const dueDate = new Date(issue);
    dueDate.setDate(dueDate.getDate() + 7);
    out.push({
      id: key,
      number: `INV-${key.replace("-", "")}`,
      periodLabel: `${MONTHS[mo - 1]} ${y}`,
      issueISO: issue.toISOString(),
      dueISO: dueDate.toISOString(),
      status: due ? "due" : "paid",
      items,
      subtotal: total,
      total,
    });
  }
  return out.sort((a, b) => b.id.localeCompare(a.id));
}

const cityLine = (b?: BillTo) => (b ? [b.city, [b.state, b.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "");
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Print / Save-as-PDF: opens a neutral, single-page invoice document. */
function printInvoice(inv: Invoice, bill?: BillTo) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const rows = inv.items
    .map(
      (i) => `<tr>
        <td style="padding:9px 0;border-bottom:1px solid #eee">${esc(i.title)}<br><span style="color:#8a8f98;font-size:11px">${esc(i.subtitle)}${i.tracking ? " · " + esc(i.tracking) : ""}</span></td>
        <td style="padding:9px 0;border-bottom:1px solid #eee;text-align:center">1</td>
        <td style="padding:9px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${money(i.amount)}</td>
      </tr>`,
    )
    .join("");
  const billTo = bill
    ? `${esc(bill.name || "Customer")}${bill.street ? "<br>" + esc(bill.street) : ""}${cityLine(bill) ? "<br>" + esc(cityLine(bill)) : ""}${bill.phone ? "<br>" + esc(bill.phone) : ""}${bill.email ? "<br>" + esc(bill.email) : ""}`
    : "Customer";
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${inv.number}</title>
    <style>*{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0b1220;box-sizing:border-box}
    body{max-width:680px;margin:32px auto;padding:0 28px}</style></head><body>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px">
      <img src="${origin}/img/routelyLogoBlack.svg" alt="Routely" style="height:36px"/>
      <div style="text-align:right"><div style="font-size:22px;font-weight:800;letter-spacing:-.5px">INVOICE</div>
      <div style="color:#8a8f98;font-size:12px">${inv.number}</div></div>
    </div>
    <div style="display:flex;justify-content:space-between;gap:24px;margin:20px 0 8px;font-size:13px;line-height:1.5">
      <div style="max-width:50%"><div style="color:#8a8f98;text-transform:uppercase;font-size:10px;letter-spacing:.6px;margin-bottom:3px">From</div>
      <b>Routely</b><br>Hello AI Technologies<br>Florida, USA<br>billing@routelypro.com</div>
      <div style="max-width:50%;text-align:right"><div style="color:#8a8f98;text-transform:uppercase;font-size:10px;letter-spacing:.6px;margin-bottom:3px">Bill to</div>${billTo}</div>
    </div>
    <div style="display:flex;gap:32px;margin:16px 0;font-size:12px">
      <div><span style="color:#8a8f98">Issue date</span><br><b>${longDate(inv.issueISO)}</b></div>
      <div><span style="color:#8a8f98">Due date</span><br><b>${longDate(inv.dueISO)}</b></div>
      <div><span style="color:#8a8f98">Period</span><br><b>${inv.periodLabel}</b></div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:10px">
      <thead><tr>
        <th style="text-align:left;padding-bottom:8px;border-bottom:2px solid #0b1220;font-size:10px;text-transform:uppercase;color:#8a8f98;letter-spacing:.5px">Description</th>
        <th style="text-align:center;padding-bottom:8px;border-bottom:2px solid #0b1220;font-size:10px;text-transform:uppercase;color:#8a8f98;letter-spacing:.5px">Qty</th>
        <th style="text-align:right;padding-bottom:8px;border-bottom:2px solid #0b1220;font-size:10px;text-transform:uppercase;color:#8a8f98;letter-spacing:.5px">Amount</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="margin-top:16px;display:flex;justify-content:flex-end">
      <table style="font-size:13px;min-width:220px">
      <tr><td style="padding:4px 24px 4px 0;color:#8a8f98">Subtotal</td><td style="text-align:right">${money(inv.subtotal)}</td></tr>
      <tr><td style="padding:4px 24px 4px 0;color:#8a8f98">Tax</td><td style="text-align:right">$0.00</td></tr>
      <tr><td style="padding:10px 24px 0 0;font-weight:800;font-size:16px;border-top:2px solid #0b1220">Total due</td><td style="text-align:right;font-weight:800;font-size:16px;border-top:2px solid #0b1220;padding-top:10px">${money(inv.total)}</td></tr></table>
    </div>
    <div style="margin-top:28px;padding:12px 14px;background:#f6f7f9;border-radius:8px;font-size:12px;color:#555;line-height:1.5">
      <b style="color:#0b1220">Status: ${inv.status === "paid" ? "Paid" : "Payment due"}</b><br>
      Payment terms: Net 7. Charges billed to the card on file. Thank you for shipping with Routely.</div>
    <script>window.onload=function(){window.print()}</script></body></html>`;
  const w = window.open("", "_blank", "width=780,height=920");
  if (w) {
    w.document.write(html);
    w.document.close();
  }
}

export function InvoicesTab() {
  const [data, setData] = useState<BillingCharges | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    fetch("/api/client/billing/charges")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => !d.error && setData(d as BillingCharges))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const invoices = useMemo(() => buildInvoices(data?.charges ?? []), [data?.charges]);
  const bill = data?.bill_to;
  const selected = invoices.find((i) => i.id === selectedId) ?? invoices[0] ?? null;

  async function payInvoice() {
    setPaying(true);
    const res = await fetch("/api/stripe/billing-portal", { method: "POST" }).catch(() => null);
    const j = res ? await res.json().catch(() => ({})) : {};
    setPaying(false);
    if (j.url) window.location.href = j.url;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 rounded-xl border border-primary/20 bg-primary/[0.04] px-4 py-3">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <p className="text-muted-foreground text-sm">
          Monthly statements generated from your real charges. A formal invoicing system with stored PDFs is on the
          roadmap.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Invoice list */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Invoices</CardTitle>
            <p className="text-muted-foreground text-sm">
              {invoices.length} statement{invoices.length === 1 ? "" : "s"}
            </p>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={`i-${i}`} className="h-16 w-full" />
                ))}
              </div>
            ) : invoices.length === 0 ? (
              <div className="rounded-lg border border-dashed py-10 text-center text-muted-foreground text-sm">
                No invoices yet.
              </div>
            ) : (
              <div className="space-y-2">
                {invoices.map((inv) => {
                  const active = selected?.id === inv.id;
                  return (
                    <button
                      key={inv.id}
                      type="button"
                      onClick={() => setSelectedId(inv.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all",
                        active
                          ? "border-primary bg-primary/[0.04] shadow-sm"
                          : "bg-card hover:border-primary/30 hover:bg-muted/40",
                      )}
                    >
                      <span
                        className={cn(
                          "grid size-9 shrink-0 place-items-center rounded-lg",
                          active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                        )}
                      >
                        <FileText className="size-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-sm">{inv.periodLabel}</p>
                        <p className="truncate font-mono text-[11px] text-muted-foreground tabular-nums">{inv.number}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-semibold text-sm tabular-nums">{money(inv.total)}</p>
                        <Badge
                          variant="outline"
                          className={cn(
                            "mt-0.5 h-4 text-[10px]",
                            inv.status === "paid"
                              ? "border-success/25 bg-success/10 text-success"
                              : "border-warning/30 bg-warning/15 text-warning-foreground dark:text-warning",
                          )}
                        >
                          {inv.status === "paid" ? "Paid" : "Due"}
                        </Badge>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Invoice document */}
        <Card className="lg:col-span-3">
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-3 p-6">
                <Skeleton className="h-8 w-40" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : !selected ? (
              <p className="py-16 text-center text-muted-foreground text-sm">Select an invoice to preview it.</p>
            ) : (
              <div className="flex h-full flex-col">
                <div className="flex-1 space-y-5 p-5 sm:p-6">
                  {/* Header: logo + INVOICE */}
                  <div className="flex items-start justify-between gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/img/routelyLogoBlack.svg" alt="Routely" className="h-8 w-auto dark:invert sm:h-9" />
                    <div className="text-right">
                      <p className="font-bold text-lg tracking-tight">INVOICE</p>
                      <p className="font-mono text-[11px] text-muted-foreground tabular-nums">{selected.number}</p>
                    </div>
                  </div>

                  {/* From / Bill to */}
                  <div className="flex flex-wrap justify-between gap-4 text-sm">
                    <div className="min-w-0">
                      <p className="type-label text-muted-foreground">From</p>
                      <p className="font-semibold">Routely</p>
                      <p className="text-muted-foreground text-xs leading-relaxed">
                        Hello AI Technologies
                        <br />
                        Florida, USA
                        <br />
                        billing@routelypro.com
                      </p>
                    </div>
                    <div className="min-w-0 text-right">
                      <p className="type-label text-muted-foreground">Bill to</p>
                      <p className="font-semibold">{bill?.name || "Customer"}</p>
                      <p className="text-muted-foreground text-xs leading-relaxed">
                        {bill?.street && (
                          <>
                            {bill.street}
                            <br />
                          </>
                        )}
                        {cityLine(bill) && (
                          <>
                            {cityLine(bill)}
                            <br />
                          </>
                        )}
                        {bill?.phone && (
                          <>
                            {bill.phone}
                            <br />
                          </>
                        )}
                        {bill?.email}
                      </p>
                    </div>
                  </div>

                  {/* Dates */}
                  <div className="flex flex-wrap gap-x-8 gap-y-2 rounded-lg bg-muted/40 px-3.5 py-2.5 text-xs">
                    <div>
                      <p className="text-muted-foreground">Issue date</p>
                      <p className="font-medium">{longDate(selected.issueISO)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Due date</p>
                      <p className="font-medium">{longDate(selected.dueISO)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Period</p>
                      <p className="font-medium">{selected.periodLabel}</p>
                    </div>
                    <div className="ml-auto self-center">
                      <Badge
                        variant="outline"
                        className={cn(
                          selected.status === "paid"
                            ? "border-success/25 bg-success/10 text-success"
                            : "border-warning/30 bg-warning/15 text-warning-foreground dark:text-warning",
                        )}
                      >
                        {selected.status === "paid" ? "Paid" : "Payment due"}
                      </Badge>
                    </div>
                  </div>

                  {/* Line items */}
                  <div className="overflow-hidden rounded-lg border">
                    <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b bg-muted/40 px-3 py-2 type-label text-muted-foreground">
                      <span>Description</span>
                      <span className="w-8 text-center">Qty</span>
                      <span className="w-20 text-right">Amount</span>
                    </div>
                    <div className="divide-y divide-border/60">
                      {selected.items.map((i) => (
                        <div key={i.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-2.5">
                          <div className="min-w-0">
                            <p className="truncate text-sm">{i.title}</p>
                            <p className="truncate text-muted-foreground text-xs">
                              {i.subtitle}
                              {i.tracking ? ` · ${i.tracking}` : ""}
                            </p>
                          </div>
                          <span className="w-8 text-center text-muted-foreground text-sm tabular-nums">1</span>
                          <span className="w-20 text-right font-medium text-sm tabular-nums">{money(i.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Totals — lead with the total */}
                  <div className="flex justify-end">
                    <div className="w-full max-w-[240px] space-y-1.5 text-sm">
                      <div className="flex justify-between text-muted-foreground">
                        <span>Subtotal</span>
                        <span className="tabular-nums">{money(selected.subtotal)}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Tax</span>
                        <span className="tabular-nums">{money(0)}</span>
                      </div>
                      <Separator />
                      <div className="flex items-baseline justify-between">
                        <span className="font-semibold">Total due</span>
                        <span className="font-bold text-xl tabular-nums">{money(selected.total)}</span>
                      </div>
                    </div>
                  </div>

                  <p className="text-muted-foreground text-xs leading-relaxed">
                    Payment terms: Net 7. Charges are billed to the card on file. Thank you for shipping with Routely.
                  </p>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2 border-t bg-muted/20 p-4">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 gap-1.5"
                    onClick={() => printInvoice(selected, bill)}
                  >
                    <Printer className="size-4" aria-hidden="true" /> Print
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 gap-1.5"
                    onClick={() => printInvoice(selected, bill)}
                  >
                    <Download className="size-4" aria-hidden="true" /> Save as PDF
                  </Button>
                  {selected.status === "due" && (
                    <Button size="sm" className="ml-auto h-9 gap-1.5" onClick={payInvoice} disabled={paying}>
                      {paying ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <CreditCard className="size-4" aria-hidden="true" />
                      )}
                      Pay invoice
                    </Button>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
