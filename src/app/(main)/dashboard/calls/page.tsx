"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ExternalLink, Phone, PhoneIncoming, PhoneOutgoing, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const API = "https://routelypro.com/api/calls";

interface Call {
  _id: string;
  caller_phone?: string;
  caller_name?: string;
  duration?: number;
  status?: string;
  direction?: string;
  summary?: string;
  transcript?: string;
  created_at?: string;
  call_id?: string;
  assistant_id?: string;
  ended_reason?: string;
  recording_url?: string;
  cost?: number;
}

const formatDuration = (secs?: number) => {
  if (!secs) return "—";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

export default function CallsPage() {
  const [data, setData] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Call | null>(null);
  const [search, setSearch] = useState("");
  const [dirFilter, setDirFilter] = useState("all");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}?limit=200`);
      if (res.ok) {
        const d = await res.json();
        setData(d.list || d || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = useMemo(() => {
    let r = data;
    if (search) {
      const q = search.toLowerCase();
      r = r.filter(
        (c) =>
          c.caller_phone?.includes(q) ||
          c.caller_name?.toLowerCase().includes(q) ||
          c.summary?.toLowerCase().includes(q),
      );
    }
    if (dirFilter !== "all") r = r.filter((c) => c.direction === dirFilter);
    return r;
  }, [data, search, dirFilter]);

  const cols: ColumnDef<Call>[] = [
    {
      accessorKey: "caller_phone",
      header: "Phone",
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.caller_phone || "—"}</span>,
    },
    {
      accessorKey: "caller_name",
      header: "Caller",
      cell: ({ row }) => <span className="font-medium">{row.original.caller_name || "Unknown"}</span>,
    },
    {
      accessorKey: "direction",
      header: "Dir",
      cell: ({ row }) => (
        <span className="flex items-center gap-1">
          {row.original.direction === "inbound" ? (
            <PhoneIncoming className="h-3 w-3 text-green-500" />
          ) : (
            <PhoneOutgoing className="h-3 w-3 text-blue-500" />
          )}
          <span className="text-xs capitalize">{row.original.direction || "—"}</span>
        </span>
      ),
    },
    {
      accessorKey: "duration",
      header: "Duration",
      cell: ({ row }) => <span className="text-sm tabular-nums">{formatDuration(row.original.duration)}</span>,
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.original.status === "ended" ? "secondary" : "default"} className="text-xs capitalize">
          {row.original.status || "—"}
        </Badge>
      ),
    },
    {
      accessorKey: "ended_reason",
      header: "Ended",
      cell: ({ row }) => <span className="text-muted-foreground text-xs">{row.original.ended_reason || "—"}</span>,
    },
    {
      accessorKey: "cost",
      header: "Cost",
      cell: ({ row }) =>
        row.original.cost ? (
          <span className="text-xs tabular-nums">${row.original.cost.toFixed(4)}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      accessorKey: "created_at",
      header: "Date",
      cell: ({ row }) =>
        row.original.created_at ? (
          <span className="text-xs">{new Date(row.original.created_at).toLocaleString()}</span>
        ) : (
          <span>—</span>
        ),
    },
  ];

  const table = useReactTable({
    data: filtered,
    columns: cols,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
  });

  const totalDuration = data.reduce((s, c) => s + (c.duration || 0), 0);
  const totalCost = data.reduce((s, c) => s + (c.cost || 0), 0);
  const inbound = data.filter((c) => c.direction === "inbound").length;

  if (loading)
    return (
      <div className="p-6">
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-0">
      <div className={`flex flex-1 flex-col gap-4 overflow-hidden p-6 ${selected ? "pr-0" : ""}`}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-semibold text-2xl">Calls</h1>
            <p className="text-muted-foreground text-sm">{filtered.length} calls</p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData}>
            Refresh
          </Button>
        </div>

        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Total Calls", value: data.length, color: "text-blue-600" },
            { label: "Inbound", value: inbound, color: "text-green-600" },
            { label: "Total Duration", value: formatDuration(totalDuration), color: "text-violet-600" },
            { label: "Total Cost", value: `$${totalCost.toFixed(2)}`, color: "text-amber-600" },
          ].map((stat) => (
            <Card key={stat.label}>
              <CardContent className="pt-4 pb-4">
                <p className="mb-1 text-muted-foreground text-xs">{stat.label}</p>
                <p className={`font-bold text-2xl tabular-nums ${stat.color}`}>{stat.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex gap-2">
          <Input
            placeholder="Search calls..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64"
          />
          <Select value={dirFilter} onValueChange={setDirFilter}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="inbound">Inbound</SelectItem>
              <SelectItem value="outbound">Outbound</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 overflow-auto rounded-xl border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id}>
                  {hg.headers.map((h) => (
                    <TableHead key={h.id}>{flexRender(h.column.columnDef.header, h.getContext())}</TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={cols.length} className="h-24 text-center text-muted-foreground">
                    No calls found
                  </TableCell>
                </TableRow>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className={`cursor-pointer hover:bg-muted/50 ${selected?._id === row.original._id ? "bg-muted" : ""}`}
                    onClick={() => setSelected(row.original)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-sm">
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Previous
            </Button>
            <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
              Next
            </Button>
          </div>
        </div>
      </div>

      {selected && (
        <div className="w-[420px] shrink-0 overflow-auto border-l bg-background p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Phone className="h-5 w-5 text-muted-foreground" />
              <h2 className="font-semibold text-lg">{selected.caller_phone || "Unknown"}</h2>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setSelected(null)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Call Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                {(
                  [
                    ["Phone", selected.caller_phone],
                    ["Caller", selected.caller_name],
                    ["Direction", selected.direction],
                    ["Status", selected.status],
                    ["Duration", formatDuration(selected.duration)],
                    ["Ended Reason", selected.ended_reason],
                    ["Cost", selected.cost ? `$${selected.cost.toFixed(4)}` : undefined],
                    ["Date", selected.created_at ? new Date(selected.created_at).toLocaleString() : undefined],
                  ] as [string, string | undefined][]
                ).map(([label, value]) =>
                  value ? (
                    <div key={label} className="flex justify-between">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="max-w-[200px] truncate text-right font-medium">{value}</span>
                    </div>
                  ) : null,
                )}
              </CardContent>
            </Card>
            {selected.summary && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">AI Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed">{selected.summary}</p>
                </CardContent>
              </Card>
            )}
            {selected.transcript && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Transcript</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="max-h-64 overflow-auto whitespace-pre-wrap text-xs leading-relaxed">
                    {selected.transcript}
                  </p>
                </CardContent>
              </Card>
            )}
            {selected.recording_url && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Recording</CardTitle>
                </CardHeader>
                <CardContent>
                  {/* biome-ignore lint/a11y/useMediaCaption: call recordings don't have caption tracks */}
                  <audio controls src={selected.recording_url} className="w-full" />
                  <a
                    href={selected.recording_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 flex items-center gap-1 text-blue-500 text-xs hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Open in browser
                  </a>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
