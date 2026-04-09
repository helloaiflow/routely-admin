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
import { Building2, Pencil, Plus, Trash2, X } from "lucide-react";
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

const API = "https://routelypro.com/api/data/client-locations";
const TYPES = ["pharmacy", "lab", "clinic", "hospital", "other"];
const TYPE_COLORS: Record<string, string> = {
  pharmacy: "bg-blue-100 text-blue-700",
  lab: "bg-violet-100 text-violet-700",
  clinic: "bg-teal-100 text-teal-700",
  hospital: "bg-red-100 text-red-700",
  other: "bg-gray-100 text-gray-700",
};

const schema = z.object({
  name: z.string().min(2),
  location_code: z.string().min(1),
  address: z.string().min(5),
  city: z.string().optional(),
  state: z.string().optional(),
  zipcode: z.string().optional(),
  type: z.string().optional(),
  phone: z.string().optional(),
  contact_name: z.string().optional(),
});
type FD = z.infer<typeof schema>;
interface ClientLocation {
  _id: string;
  name?: string;
  location_code?: string;
  address?: string;
  city?: string;
  state?: string;
  zipcode?: string;
  type?: string;
  phone?: string;
  contact_name?: string;
  created_at?: string;
}

export default function ClientLocationsPage() {
  const [data, setData] = useState<ClientLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ClientLocation | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ClientLocation | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ClientLocation | null>(null);
  const [saving, setSaving] = useState(false);
  const form = useForm<FD>({ resolver: zodResolver(schema), defaultValues: { type: "other" } });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}?limit=200`);
      if (res.ok) {
        const d = await res.json();
        setData(Array.isArray(d) ? d : d.list || []);
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
        (x) =>
          x.name?.toLowerCase().includes(q) ||
          x.location_code?.toLowerCase().includes(q) ||
          x.address?.toLowerCase().includes(q),
      );
    }
    if (typeFilter !== "all") r = r.filter((x) => x.type === typeFilter);
    return r;
  }, [data, search, typeFilter]);

  const cols: ColumnDef<ClientLocation>[] = [
    {
      accessorKey: "location_code",
      header: "Code",
      cell: ({ row }) => (
        <span className="rounded bg-muted px-2 py-1 font-mono text-xs font-bold">{row.original.location_code}</span>
      ),
    },
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => (
        <span
          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${TYPE_COLORS[row.original.type || "other"]}`}
        >
          {row.original.type || "other"}
        </span>
      ),
    },
    {
      accessorKey: "address",
      header: "Address",
      cell: ({ row }) => <span className="block max-w-[200px] truncate text-sm">{row.original.address}</span>,
    },
    { accessorKey: "city", header: "City" },
    {
      accessorKey: "phone",
      header: "Phone",
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.phone || "—"}</span>,
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
    form.reset({ type: "other" });
    setDialogOpen(true);
  };
  const openEdit = (r: ClientLocation) => {
    setEditing(r);
    form.reset({ ...r, type: r.type || "other" });
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
    if (selected?._id === deleteTarget._id) setSelected(null);
    await fetchData();
  };

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
            <h1 className="font-semibold text-2xl">Client Locations</h1>
            <p className="text-muted-foreground text-sm">{filtered.length} locations</p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Add Location
          </Button>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Search locations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64"
          />
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {TYPES.map((t) => (
                <SelectItem key={t} value={t} className="capitalize">
                  {t}
                </SelectItem>
              ))}
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
                    No locations found
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
        <div className="w-[360px] shrink-0 overflow-auto border-l bg-background p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <h2 className="font-semibold text-base">{selected.name}</h2>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setSelected(null)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-3">
            <Card>
              <CardContent className="space-y-2 pt-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Code</span>
                  <span className="font-bold font-mono">{selected.location_code}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Type</span>
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${TYPE_COLORS[selected.type || "other"]}`}
                  >
                    {selected.type}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Address</span>
                  <span className="max-w-[180px] text-right">{selected.address}</span>
                </div>
                {selected.city && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">City</span>
                    <span>
                      {selected.city}, {selected.state} {selected.zipcode}
                    </span>
                  </div>
                )}
                {selected.phone && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Phone</span>
                    <span className="font-mono">{selected.phone}</span>
                  </div>
                )}
                {selected.contact_name && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Contact</span>
                    <span>{selected.contact_name}</span>
                  </div>
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
            <DialogTitle>{editing ? "Edit Location" : "Add Location"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Name *</Label>
                <Input {...form.register("name")} />
              </div>
              <div>
                <Label>Location Code *</Label>
                <Input {...form.register("location_code")} placeholder="MCM, CVS_DANIA..." className="uppercase" />
              </div>
              <div>
                <Label>Type</Label>
                <Select value={form.watch("type")} onValueChange={(v) => form.setValue("type", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPES.map((t) => (
                      <SelectItem key={t} value={t} className="capitalize">
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Address *</Label>
                <Input {...form.register("address")} />
              </div>
              <div>
                <Label>City</Label>
                <Input {...form.register("city")} />
              </div>
              <div>
                <Label>State</Label>
                <Input {...form.register("state")} maxLength={2} />
              </div>
              <div>
                <Label>Phone</Label>
                <Input {...form.register("phone")} />
              </div>
              <div>
                <Label>Contact Name</Label>
                <Input {...form.register("contact_name")} />
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
            <AlertDialogTitle>Delete Location</AlertDialogTitle>
            <AlertDialogDescription>Delete &quot;{deleteTarget?.name}&quot;?</AlertDialogDescription>
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
