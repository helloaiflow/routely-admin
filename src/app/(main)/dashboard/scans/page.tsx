"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useSearchParams } from "next/navigation";

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Download, Package, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Scan {
  _id: string;
  rtscan_id?: string;
  full_name?: string;
  rx_pharma_id?: string;
  address?: string;
  city?: string;
  state?: string;
  zipcode?: string;
  route?: string;
  client_location?: string;
  new_patient?: boolean;
  collect_payment?: boolean;
  collect_amount?: number;
  type?: string;
  signature_required?: boolean;
  delivery_today?: boolean;
  created_at?: string;
  phone?: string;
  dob?: string;
  rx_creation_date?: string;
  note?: string;
  image_url?: string;
}

const columns: ColumnDef<Scan>[] = [
  {
    accessorKey: "rtscan_id",
    header: "Scan ID",
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.original.rtscan_id || row.original._id.slice(-6)}</span>
    ),
  },
  {
    accessorKey: "full_name",
    header: "Patient",
    cell: ({ row }) => <span className="font-medium">{row.original.full_name || "-"}</span>,
  },
  {
    accessorKey: "rx_pharma_id",
    header: "Rx #",
    cell: ({ row }) => <span className="font-mono text-xs">{row.original.rx_pharma_id || "-"}</span>,
  },
  {
    accessorKey: "address",
    header: "Address",
    cell: ({ row }) => <span className="block max-w-[180px] truncate">{row.original.address || "-"}</span>,
  },
  { accessorKey: "route", header: "Route" },
  { accessorKey: "client_location", header: "Branch" },
  {
    accessorKey: "new_patient",
    header: "New?",
    cell: ({ row }) =>
      row.original.new_patient ? (
        <Badge variant="secondary" className="text-xs">
          New
        </Badge>
      ) : (
        "-"
      ),
  },
  {
    accessorKey: "collect_amount",
    header: "Collect",
    cell: ({ row }) =>
      row.original.collect_payment ? (
        <span className="tabular-nums">${(row.original.collect_amount ?? 0).toFixed(2)}</span>
      ) : (
        "-"
      ),
  },
  {
    accessorKey: "type",
    header: "Cold",
    cell: ({ row }) =>
      row.original.type?.includes("cold") ? (
        <Badge variant="outline" className="text-cyan-600 text-xs">
          Cold
        </Badge>
      ) : (
        "-"
      ),
  },
  {
    accessorKey: "signature_required",
    header: "Sig",
    cell: ({ row }) =>
      row.original.signature_required ? (
        <Badge variant="outline" className="text-xs">
          Sig
        </Badge>
      ) : (
        "-"
      ),
  },
  {
    accessorKey: "created_at",
    header: "Date",
    cell: ({ row }) => (row.original.created_at ? new Date(row.original.created_at).toLocaleDateString() : "-"),
  },
];

export default function ScansPage() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<Scan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Scan | null>(null);
  const [search, setSearch] = useState(searchParams.get("search") || "");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/data/package-scans");
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = useMemo(() => {
    if (!search) return data;
    const q = search.toLowerCase();
    return data.filter(
      (s) =>
        s.full_name?.toLowerCase().includes(q) ||
        s.rx_pharma_id?.toLowerCase().includes(q) ||
        s.address?.toLowerCase().includes(q) ||
        s.rtscan_id?.toLowerCase().includes(q),
    );
  }, [data, search]);

  const table = useReactTable({
    data: filtered,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    initialState: { pagination: { pageSize: 20 } },
  });

  const exportCsv = () => {
    const headers = [
      "Scan ID",
      "Patient",
      "Rx #",
      "Address",
      "Route",
      "Branch",
      "New",
      "Collect",
      "Cold",
      "Sig",
      "Date",
    ];
    const rows = filtered.map((s) => [
      s.rtscan_id,
      s.full_name,
      s.rx_pharma_id,
      s.address,
      s.route,
      s.client_location,
      s.new_patient,
      s.collect_amount,
      s.type,
      s.signature_required,
      s.created_at,
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c ?? ""}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "scans.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-0">
      <div className={`flex flex-1 flex-col gap-4 overflow-hidden p-6 ${selected ? "pr-0" : ""}`}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-semibold text-2xl">Package Scans</h1>
            <p className="text-muted-foreground text-sm">{filtered.length} scans found</p>
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Input
            placeholder="Search scans..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64"
          />
        </div>

        <div className="flex-1 overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id}>
                  {hg.headers.map((h) => (
                    <TableHead key={h.id}>
                      {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                    No scans found
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
        <div className="w-[400px] shrink-0 overflow-auto border-l bg-background p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-muted-foreground" />
              <h2 className="font-semibold text-lg">{selected.full_name || "Unknown"}</h2>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setSelected(null)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          {selected.rtscan_id && (
            <Badge variant="outline" className="mb-4 font-mono text-xs">
              {selected.rtscan_id}
            </Badge>
          )}

          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Patient Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <Row label="Name" value={selected.full_name} />
                <Row label="DOB" value={selected.dob} />
                <Row label="Phone" value={selected.phone} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Address</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <Row label="Address" value={selected.address} />
                <Row label="City" value={selected.city} />
                <Row label="State" value={selected.state} />
                <Row label="Zip" value={selected.zipcode} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Package</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <Row label="Rx Pharma ID" value={selected.rx_pharma_id} />
                <Row label="Rx Created" value={selected.rx_creation_date} />
                <Row label="Type" value={selected.type} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Delivery Flags</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <Row label="Delivery Today" value={selected.delivery_today ? "Yes" : "No"} />
                <Row label="Collect Payment" value={selected.collect_payment ? "Yes" : "No"} />
                <Row
                  label="Collect Amount"
                  value={selected.collect_amount ? `$${selected.collect_amount.toFixed(2)}` : "-"}
                />
                <Row label="Signature Required" value={selected.signature_required ? "Yes" : "No"} />
              </CardContent>
            </Card>

            {selected.note && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Note</CardTitle>
                </CardHeader>
                <CardContent className="text-sm">{selected.note}</CardContent>
              </Card>
            )}

            {selected.image_url && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Image</CardTitle>
                </CardHeader>
                <CardContent>
                  <img src={selected.image_url} alt="Scan" className="w-full rounded-md border" />
                </CardContent>
              </Card>
            )}

            <Separator />

            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() =>
                window.open(`/dashboard/stops?search=${encodeURIComponent(selected.full_name || "")}`, "_self")
              }
            >
              View Matched Stop
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value || "-"}</span>
    </div>
  );
}
