"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useSearchParams } from "next/navigation";

import {
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Download, MapPin, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Stop {
  _id: string;
  rtstop_id?: string;
  recipient_name?: string;
  rx_pharma_id?: string;
  address?: string;
  city?: string;
  state?: string;
  zipcode?: string;
  route_title?: string;
  label_status?: string;
  delivery_state?: string;
  stop_position?: number;
  eta?: string;
  created_at?: string;
  phone?: string;
  dob?: string;
  package_id?: string;
  rx_creation_date?: string;
  stop_notes?: string;
  driver_notes?: string;
  event_type?: string;
}

function statusVariant(status: string | undefined) {
  switch (status) {
    case "Match":
      return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    case "Unmatch":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
    case "Human":
      return "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200";
    default:
      return "";
  }
}

const columns: ColumnDef<Stop>[] = [
  { accessorKey: "stop_position", header: "Stop #", cell: ({ row }) => row.original.stop_position ?? "-" },
  {
    accessorKey: "recipient_name",
    header: "Recipient",
    cell: ({ row }) => <span className="font-medium">{row.original.recipient_name || "-"}</span>,
  },
  {
    accessorKey: "rx_pharma_id",
    header: "Rx #",
    cell: ({ row }) => <span className="font-mono text-xs">{row.original.rx_pharma_id || "-"}</span>,
  },
  {
    accessorKey: "address",
    header: "Address",
    cell: ({ row }) => <span className="block max-w-[200px] truncate">{row.original.address || "-"}</span>,
  },
  { accessorKey: "route_title", header: "Route" },
  {
    accessorKey: "label_status",
    header: "Label Status",
    cell: ({ row }) =>
      row.original.label_status ? (
        <Badge variant="outline" className={statusVariant(row.original.label_status)}>
          {row.original.label_status}
        </Badge>
      ) : (
        "-"
      ),
  },
  {
    accessorKey: "delivery_state",
    header: "Delivery",
    cell: ({ row }) =>
      row.original.delivery_state ? <Badge variant="outline">{row.original.delivery_state}</Badge> : "-",
  },
  {
    accessorKey: "eta",
    header: "ETA",
    cell: ({ row }) =>
      row.original.eta
        ? new Date(row.original.eta).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : "-",
  },
  {
    accessorKey: "created_at",
    header: "Created",
    cell: ({ row }) => (row.original.created_at ? new Date(row.original.created_at).toLocaleDateString() : "-"),
  },
];

export default function StopsPage() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<Stop[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Stop | null>(null);
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [routeFilter, setRouteFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "all");
  const [deliveryFilter, setDeliveryFilter] = useState("all");
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [updating, setUpdating] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/data/spoke-stops");
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const routes = useMemo(() => [...new Set(data.map((s) => s.route_title).filter(Boolean))].sort(), [data]);
  const statuses = ["Match", "Unmatch", "Human"];
  const deliveryStates = useMemo(() => [...new Set(data.map((s) => s.delivery_state).filter(Boolean))].sort(), [data]);

  const filtered = useMemo(() => {
    let result = data;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (s) =>
          s.recipient_name?.toLowerCase().includes(q) ||
          s.rx_pharma_id?.toLowerCase().includes(q) ||
          s.address?.toLowerCase().includes(q),
      );
    }
    if (routeFilter !== "all") result = result.filter((s) => s.route_title === routeFilter);
    if (statusFilter !== "all") result = result.filter((s) => s.label_status === statusFilter);
    if (deliveryFilter !== "all") result = result.filter((s) => s.delivery_state === deliveryFilter);
    return result;
  }, [data, search, routeFilter, statusFilter, deliveryFilter]);

  const table = useReactTable({
    data: filtered,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnFiltersChange: setColumnFilters,
    state: { columnFilters },
    initialState: { pagination: { pageSize: 20 } },
  });

  const handlePatch = async (id: string, body: Record<string, string>) => {
    setUpdating(true);
    try {
      await fetch(`/api/data/spoke-stops/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await fetchData();
      if (selected?._id === id) setSelected((prev) => (prev ? { ...prev, ...body } : prev));
    } finally {
      setUpdating(false);
    }
  };

  const exportCsv = () => {
    const headers = ["Stop #", "Recipient", "Rx #", "Address", "Route", "Label Status", "Delivery", "ETA", "Created"];
    const rows = filtered.map((s) => [
      s.stop_position,
      s.recipient_name,
      s.rx_pharma_id,
      s.address,
      s.route_title,
      s.label_status,
      s.delivery_state,
      s.eta,
      s.created_at,
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c ?? ""}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "stops.csv";
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
      {/* Left: Table */}
      <div className={`flex flex-1 flex-col gap-4 overflow-hidden p-6 ${selected ? "pr-0" : ""}`}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-semibold text-2xl">Stops</h1>
            <p className="text-muted-foreground text-sm">{filtered.length} stops found</p>
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Search stops..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64"
          />
          <Select value={routeFilter} onValueChange={setRouteFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Route" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Routes</SelectItem>
              {routes.map((r) => (
                <SelectItem key={r} value={r!}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {statuses.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={deliveryFilter} onValueChange={setDeliveryFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Delivery" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Delivery</SelectItem>
              {deliveryStates.map((d) => (
                <SelectItem key={d} value={d!}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
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
                    No stops found
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

        {/* Pagination */}
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

      {/* Right: Detail Panel */}
      {selected && (
        <div className="w-[400px] shrink-0 overflow-auto border-l bg-background p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-muted-foreground" />
              <h2 className="font-semibold text-lg">{selected.recipient_name || "Unknown"}</h2>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setSelected(null)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="mb-4 flex gap-2">
            {selected.rtstop_id && (
              <Badge variant="outline" className="font-mono text-xs">
                {selected.rtstop_id}
              </Badge>
            )}
            {selected.label_status && (
              <Badge variant="outline" className={statusVariant(selected.label_status)}>
                {selected.label_status}
              </Badge>
            )}
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Patient Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <Row label="Name" value={selected.recipient_name} />
                <Row label="DOB" value={selected.dob} />
                <Row label="Phone" value={selected.phone} />
                <Row label="Address" value={selected.address} />
                <Row label="City" value={selected.city} />
                <Row label="State" value={selected.state} />
                <Row label="Zip" value={selected.zipcode} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Rx Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <Row label="Rx Pharma ID" value={selected.rx_pharma_id} />
                <Row label="Rx Created" value={selected.rx_creation_date} />
                <Row label="Package ID" value={selected.package_id} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Delivery Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <Row label="Delivery State" value={selected.delivery_state} />
                <Row label="Stop Position" value={selected.stop_position?.toString()} />
                <Row label="Route" value={selected.route_title} />
                <Row label="ETA" value={selected.eta ? new Date(selected.eta).toLocaleString() : undefined} />
              </CardContent>
            </Card>

            {(selected.stop_notes || selected.driver_notes) && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Notes</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  {selected.stop_notes && <Row label="Stop Notes" value={selected.stop_notes} />}
                  {selected.driver_notes && <Row label="Driver Notes" value={selected.driver_notes} />}
                </CardContent>
              </Card>
            )}

            <Separator />

            <div className="flex flex-col gap-2">
              <Button
                size="sm"
                disabled={updating}
                onClick={() => handlePatch(selected._id, { label_status: "Match" })}
              >
                Mark as Match
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={updating}
                onClick={() => handlePatch(selected._id, { label_status: "Human" })}
              >
                Flag for Human
              </Button>
            </div>
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
