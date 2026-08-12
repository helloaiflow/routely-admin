import type { ChargeRow } from "./charge-detail-panel";

const CSV_COLUMNS: Array<[keyof ChargeRow | "amount_usd", string]> = [
  ["attempted_at", "Date"],
  ["stop_id", "Tracking ID"],
  ["resolved_type", "Type"],
  ["attempt_seq", "Attempt"],
  ["outcome", "Outcome"],
  ["disposition", "Disposition"],
  ["units", "Units"],
  ["amount_usd", "Amount (USD)"],
  ["document_number", "Document"],
  ["document_status", "Document status"],
  ["id", "Support reference"],
];

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function rowsToCsv(rows: ChargeRow[]): string {
  const header = CSV_COLUMNS.map(([, label]) => csvEscape(label)).join(",");
  const lines = rows.map((r) =>
    CSV_COLUMNS.map(([key]) => {
      if (key === "amount_usd") return csvEscape(((r.amount_cents ?? 0) / 100).toFixed(2));
      return csvEscape((r as Record<string, unknown>)[key]);
    }).join(","),
  );
  return [header, ...lines].join("\n");
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const PAGE_SIZE = 200; // matches routely-api's charges endpoint hard cap (le=200)
const MAX_ROWS = 4000; // safety cap — 20 requests; flagged to the caller if hit

/** Fetches the FULL filtered set (not just the current page) via the same
 * /api/client/billing/ledger the grid uses, paging in PAGE_SIZE chunks, then
 * triggers a browser CSV download. Returns whether the MAX_ROWS safety cap
 * was hit, so the caller can tell the user the export was truncated instead
 * of silently shipping a partial file. */
export async function exportChargesToCsv(params: URLSearchParams): Promise<{ rows: number; truncated: boolean }> {
  const rows: ChargeRow[] = [];
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;
  while (offset < total && rows.length < MAX_ROWS) {
    const p = new URLSearchParams(params);
    p.set("limit", String(PAGE_SIZE));
    p.set("offset", String(offset));
    const r = await fetch(`/api/client/billing/ledger?${p.toString()}`);
    if (!r.ok) break;
    const d = await r.json();
    total = d.total ?? 0;
    const page: ChargeRow[] = d.rows ?? [];
    if (page.length === 0) break;
    rows.push(...page);
    offset += PAGE_SIZE;
  }
  const truncated = rows.length >= MAX_ROWS && rows.length < total;
  const csv = rowsToCsv(rows.slice(0, MAX_ROWS));
  const stamp = new Date().toISOString().slice(0, 10);
  downloadCsv(csv, `charges-${stamp}.csv`);
  return { rows: Math.min(rows.length, MAX_ROWS), truncated };
}
