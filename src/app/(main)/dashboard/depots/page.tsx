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
import { Building2, Pencil, Plus, Trash2 } from "lucide-react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const API_DEPOTS = "https://routelypro.com/api/data/depots";
const API_TENANTS = "https://routelypro.com/api/tenants";

const schema = z.object({
  depot_name: z.string().min(2, "Name required"),
  spoke_depot_id: z.string().min(2, "Spoke Depot ID required"),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipcode: z.string().optional(),
  tenant_id: z.number(),
  active: z.boolean().optional(),
});
type FD = z.infer<typeof schema>;

interface Depot {
  _id: string;
  depot_name: string;
  spoke_depot_id: string;
  address?: string;
  city?: string;
  state?: string;
  zipcode?: string;
  tenant_id: number;
  active?: boolean;
  created_at?: string;
}

export default function DepotsPage() {
  const [data, setData] = useState<Depot[]>([]);
  const [tenants, setTenants] = useState<{ tenant_id: number; company_name?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Depot | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Depot | null>(null);
  const [saving, setSaving] = useState(false);

  const form = useForm<FD>({
    resolver: zodResolver(schema),
    defaultValues: { active: true, tenant_id: 1, depot_name: "", spoke_depot_id: "" },
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [dr, tr] = await Promise.all([fetch(API_DEPOTS), fetch(API_TENANTS)]);
      if (dr.ok) {
        const d = await dr.json();
        setData(Array.isArray(d) ? d : d.list || []);
      }
      if (tr.ok) {
        const t = await tr.json();
        setTenants(t.list || []);
      }
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
      (r) =>
        r.depot_name?.toLowerCase().includes(q) ||
        r.spoke_depot_id?.toLowerCase().includes(q) ||
        r.address?.toLowerCase().includes(q),
    );
  }, [data, search]);

  const tenantName = (tid: number) => tenants.find((t) => t.tenant_id === tid)?.company_name || `Tenant ${tid}`;

  const cols: ColumnDef<Depot>[] = [
    {
      accessorKey: "depot_name",
      header: "Depot Name",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{row.original.depot_name}</span>
        </div>
      ),
    },
    {
      accessorKey: "spoke_depot_id",
      header: "Spoke Depot ID",
      cell: ({ row }) => (
        <span className="rounded bg-muted px-2 py-1 font-mono text-xs">{row.original.spoke_depot_id}</span>
      ),
    },
    {
      accessorKey: "address",
      header: "Address",
      cell: ({ row }) => (
        <span className="text-sm">
          {[row.original.address, row.original.city, row.original.state].filter(Boolean).join(", ") || "—"}
        </span>
      ),
    },
    {
      accessorKey: "tenant_id",
      header: "Tenant",
      cell: ({ row }) => <Badge variant="outline">{tenantName(row.original.tenant_id)}</Badge>,
    },
    {
      accessorKey: "active",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.original.active !== false ? "default" : "secondary"}>
          {row.original.active !== false ? "Active" : "Inactive"}
        </Badge>
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
    form.reset({
      active: true,
      tenant_id: 1,
      depot_name: "",
      spoke_depot_id: "",
      address: "",
      city: "",
      state: "",
      zipcode: "",
    });
    setDialogOpen(true);
  };
  const openEdit = (r: Depot) => {
    setEditing(r);
    form.reset({ ...r, tenant_id: r.tenant_id, active: r.active !== false });
    setDialogOpen(true);
  };

  const onSubmit = async (v: FD) => {
    setSaving(true);
    try {
      const method = editing ? "PUT" : "POST";
      const url = editing ? `${API_DEPOTS}/${editing._id}` : API_DEPOTS;
      await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(v) });
      setDialogOpen(false);
      await fetchData();
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!deleteTarget) return;
    await fetch(`${API_DEPOTS}/${deleteTarget._id}`, { method: "DELETE" });
    setDeleteTarget(null);
    await fetchData();
  };

  if (loading)
    return (
      <div className="p-6">
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Depots</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} depots registered</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add Depot
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Total Depots</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{data.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Active</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">{data.filter((d) => d.active !== false).length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tenants Covered</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-blue-600">{[...new Set(data.map((d) => d.tenant_id))].length}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-2">
        <Input
          placeholder="Search depots..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-72"
        />
      </div>

      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id}>
                    {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
                <TableHead>Actions</TableHead>
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={cols.length + 1} className="h-24 text-center text-muted-foreground">
                  No depots found
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} className="hover:bg-muted/50">
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                  <TableCell>
                    <span className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(row.original)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(row.original)}>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Depot" : "Add Depot"}</DialogTitle>
            <DialogDescription>
              Spoke depots are created manually in the Spoke dashboard. Add the Depot ID here.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Depot Name *</Label>
                <Input {...form.register("depot_name")} placeholder="MedFlorida Pharmacy" />
                {form.formState.errors.depot_name && (
                  <p className="mt-1 text-xs text-red-500">{form.formState.errors.depot_name.message}</p>
                )}
              </div>
              <div className="col-span-2">
                <Label>Spoke Depot ID *</Label>
                <Input {...form.register("spoke_depot_id")} placeholder="fV5yop9VtIM1V1DSfmyR" className="font-mono" />
                {form.formState.errors.spoke_depot_id && (
                  <p className="mt-1 text-xs text-red-500">{form.formState.errors.spoke_depot_id.message}</p>
                )}
              </div>
              <div className="col-span-2">
                <Label>Address</Label>
                <Input {...form.register("address")} placeholder="12156 West Sample Road" />
              </div>
              <div>
                <Label>City</Label>
                <Input {...form.register("city")} placeholder="Coral Springs" />
              </div>
              <div>
                <Label>State</Label>
                <Input {...form.register("state")} placeholder="FL" />
              </div>
              <div>
                <Label>Zipcode</Label>
                <Input {...form.register("zipcode")} />
              </div>
              <div>
                <Label>Tenant</Label>
                <Select
                  value={String(form.watch("tenant_id"))}
                  onValueChange={(v) => form.setValue("tenant_id", Number.parseInt(v, 10))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {tenants.map((t) => (
                      <SelectItem key={t.tenant_id} value={String(t.tenant_id)}>
                        {t.company_name || `Tenant ${t.tenant_id}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
            <AlertDialogTitle>Delete Depot</AlertDialogTitle>
            <AlertDialogDescription>Are you sure? This cannot be undone.</AlertDialogDescription>
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
