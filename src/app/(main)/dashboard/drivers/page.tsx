"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const API = "https://routelypro.com/api/data/drivers";

const schema = z.object({
  full_name: z.string().min(2),
  phone: z.string().min(10),
  email: z.string().email().optional().or(z.literal("")),
  license_plate: z.string().optional(),
  vehicle_type: z.string().optional(),
  service_area: z.string().optional(),
  status: z.string().optional(),
  spoke_driver_id: z.string().optional(),
});
type FD = z.infer<typeof schema>;

interface Driver {
  _id: string;
  full_name?: string;
  phone?: string;
  email?: string;
  license_plate?: string;
  vehicle_type?: string;
  service_area?: string;
  status?: string;
  spoke_driver_id?: string;
  created_at?: string;
}

export default function DriversPage() {
  const [data, setData] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Driver | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Driver | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Driver | null>(null);
  const [saving, setSaving] = useState(false);

  const form = useForm<FD>({ resolver: zodResolver(schema), defaultValues: { status: "active" } });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}?limit=100`);
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
      r = r.filter((d) => d.full_name?.toLowerCase().includes(q) || d.phone?.includes(q));
    }
    if (statusFilter !== "all") r = r.filter((d) => d.status === statusFilter);
    return r;
  }, [data, search, statusFilter]);

  const cols: ColumnDef<Driver>[] = [
    {
      accessorKey: "full_name",
      header: "Name",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-700 text-xs">
            {(row.original.full_name || "?").slice(0, 2).toUpperCase()}
          </div>
          <span className="font-medium">{row.original.full_name}</span>
        </div>
      ),
    },
    {
      accessorKey: "phone",
      header: "Phone",
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.phone || "—"}</span>,
    },
    { accessorKey: "vehicle_type", header: "Vehicle" },
    {
      accessorKey: "license_plate",
      header: "Plate",
      cell: ({ row }) => (
        <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs">{row.original.license_plate || "—"}</span>
      ),
    },
    { accessorKey: "service_area", header: "Area" },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.original.status === "active" ? "default" : "secondary"} className="capitalize">
          {row.original.status}
        </Badge>
      ),
    },
    {
      accessorKey: "spoke_driver_id",
      header: "Spoke ID",
      cell: ({ row }) =>
        row.original.spoke_driver_id ? (
          <span className="font-mono text-muted-foreground text-xs">{row.original.spoke_driver_id.slice(-8)}</span>
        ) : (
          <span className="text-muted-foreground text-xs">Not linked</span>
        ),
    },
  ];

  const table = useReactTable({
    data: filtered,
    columns: cols,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } },
  });

  const openCreate = () => {
    setEditing(null);
    form.reset({ status: "active" });
    setDialogOpen(true);
  };
  const openEdit = (r: Driver) => {
    setEditing(r);
    form.reset({ ...r, status: r.status || "active" });
    setDialogOpen(true);
  };
  const onSubmit = async (v: FD) => {
    setSaving(true);
    try {
      const method = editing ? "PUT" : "POST";
      const url = editing ? `${API}/${editing._id}` : API;
      await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(v) });
      setDialogOpen(false);
      await fetchData();
    } finally {
      setSaving(false);
    }
  };
  const onDelete = async () => {
    if (!deleteTarget) return;
    await fetch(`${API}/${deleteTarget._id}`, { method: "DELETE" });
    setDeleteTarget(null);
    await fetchData();
  };

  const active = data.filter((d) => d.status === "active").length;

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
            <h1 className="font-semibold text-2xl">Drivers</h1>
            <p className="text-muted-foreground text-sm">
              {active} active · {data.length} total
            </p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Add Driver
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {(
            [
              ["Total", data.length, "text-blue-600"],
              ["Active", active, "text-green-600"],
              ["Inactive", data.length - active, "text-gray-500"],
            ] as [string, number, string][]
          ).map(([l, v, c]) => (
            <Card key={l}>
              <CardContent className="pt-4 pb-4">
                <p className="mb-1 text-muted-foreground text-xs">{l}</p>
                <p className={`font-bold text-2xl ${c}`}>{v}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Search drivers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64"
          />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="on_leave">On Leave</SelectItem>
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
                  <TableHead>Actions</TableHead>
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={cols.length + 1} className="h-24 text-center text-muted-foreground">
                    No drivers found
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
                    <TableCell>
                      <span className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEdit(row.original);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(row.original);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </span>
                    </TableCell>
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
        <div className="w-[380px] shrink-0 overflow-auto border-l bg-background p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-700">
                {(selected.full_name || "?").slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h2 className="font-semibold text-base">{selected.full_name}</h2>
                <p className="text-muted-foreground text-xs capitalize">{selected.status}</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setSelected(null)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-4">
            <Card>
              <CardContent className="space-y-1.5 pt-4 text-sm">
                {(
                  [
                    ["Phone", selected.phone],
                    ["Email", selected.email],
                    ["Vehicle", selected.vehicle_type],
                    ["Plate", selected.license_plate],
                    ["Area", selected.service_area],
                    ["Spoke ID", selected.spoke_driver_id],
                  ] as [string, string | undefined][]
                ).map(([l, v]) =>
                  v ? (
                    <div key={l} className="flex justify-between">
                      <span className="text-muted-foreground">{l}</span>
                      <span className="font-medium font-mono text-xs">{v}</span>
                    </div>
                  ) : null,
                )}
              </CardContent>
            </Card>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1" onClick={() => openEdit(selected)}>
                Edit
              </Button>
              <Button size="sm" variant="destructive" onClick={() => setDeleteTarget(selected)}>
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Driver" : "Add Driver"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Full Name *</Label>
                <Input {...form.register("full_name")} />
              </div>
              <div>
                <Label>Phone *</Label>
                <Input {...form.register("phone")} />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" {...form.register("email")} />
              </div>
              <div>
                <Label>Vehicle Type</Label>
                <Input {...form.register("vehicle_type")} placeholder="Sedan, SUV, Van..." />
              </div>
              <div>
                <Label>License Plate</Label>
                <Input {...form.register("license_plate")} className="uppercase" />
              </div>
              <div>
                <Label>Service Area</Label>
                <Input {...form.register("service_area")} placeholder="Broward, Miami-Dade..." />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.watch("status")} onValueChange={(v) => form.setValue("status", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="on_leave">On Leave</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Spoke Driver ID</Label>
                <Input {...form.register("spoke_driver_id")} placeholder="drivers/xxxxx" className="font-mono" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : editing ? "Update" : "Create"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Driver</AlertDialogTitle>
            <AlertDialogDescription>Delete &quot;{deleteTarget?.full_name}&quot;?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
