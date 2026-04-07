"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useSearchParams } from "next/navigation";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Pencil, Plus, Trash2, Users, X } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const API = "https://routelypro.com/api/data/recipients";

const schema = z.object({
  name: z.string().min(2),
  dob: z.string(),
  phone: z.string().min(10),
  address: z.string().min(5),
  city: z.string().min(2),
  state: z.string().length(2),
  zipcode: z.string().length(5),
});
type FormData = z.infer<typeof schema>;

interface Recipient {
  _id: string;
  name?: string;
  dob?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zipcode?: string;
  created_at?: string;
}

const columns: ColumnDef<Recipient>[] = [
  {
    accessorKey: "_id",
    header: "ID",
    cell: ({ row }) => <span className="font-mono text-xs">{row.original._id.slice(-6)}</span>,
  },
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => <span className="font-medium">{row.original.name || "-"}</span>,
  },
  { accessorKey: "dob", header: "DOB" },
  { accessorKey: "phone", header: "Phone" },
  {
    accessorKey: "address",
    header: "Address",
    cell: ({ row }) => <span className="block max-w-[200px] truncate">{row.original.address || "-"}</span>,
  },
  { accessorKey: "city", header: "City" },
  { accessorKey: "state", header: "State" },
  {
    accessorKey: "created_at",
    header: "Created",
    cell: ({ row }) => (row.original.created_at ? new Date(row.original.created_at).toLocaleDateString() : "-"),
  },
];

export default function RecipientsPage() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Recipient | null>(null);
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Recipient | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Recipient | null>(null);
  const [saving, setSaving] = useState(false);

  const form = useForm<FormData>({ resolver: zodResolver(schema) });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(API);
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
      (r) =>
        r.name?.toLowerCase().includes(q) || r.phone?.toLowerCase().includes(q) || r.address?.toLowerCase().includes(q),
    );
  }, [data, search]);

  const table = useReactTable({
    data: filtered,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } },
  });

  const openCreate = () => {
    setEditing(null);
    form.reset({ name: "", dob: "", phone: "", address: "", city: "", state: "", zipcode: "" });
    setDialogOpen(true);
  };

  const openEdit = (r: Recipient) => {
    setEditing(r);
    form.reset({
      name: r.name || "",
      dob: r.dob || "",
      phone: r.phone || "",
      address: r.address || "",
      city: r.city || "",
      state: r.state || "",
      zipcode: r.zipcode || "",
    });
    setDialogOpen(true);
  };

  const onSubmit = async (values: FormData) => {
    setSaving(true);
    try {
      const method = editing ? "PUT" : "POST";
      const url = editing ? `${API}/${editing._id}` : API;
      await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
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
            <h1 className="font-semibold text-2xl">Recipients</h1>
            <p className="text-muted-foreground text-sm">{filtered.length} recipients</p>
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Add Recipient
          </Button>
        </div>
        <Input
          placeholder="Search recipients..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64"
        />

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
                  <TableHead>Actions</TableHead>
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length + 1} className="h-24 text-center text-muted-foreground">
                    No recipients found
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
              <Users className="h-5 w-5 text-muted-foreground" />
              <h2 className="font-semibold text-lg">{selected.name || "Unknown"}</h2>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setSelected(null)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <InfoRow label="Name" value={selected.name} />
              <InfoRow label="DOB" value={selected.dob} />
              <InfoRow label="Phone" value={selected.phone} />
              <InfoRow label="Address" value={selected.address} />
              <InfoRow label="City" value={selected.city} />
              <InfoRow label="State" value={selected.state} />
              <InfoRow label="Zipcode" value={selected.zipcode} />
              <InfoRow
                label="Created"
                value={selected.created_at ? new Date(selected.created_at).toLocaleString() : undefined}
              />
            </CardContent>
          </Card>
          <div className="mt-4 flex gap-2">
            <Button size="sm" variant="outline" onClick={() => openEdit(selected)}>
              Edit
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setDeleteTarget(selected)}>
              Delete
            </Button>
          </div>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Recipient" : "Add Recipient"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input {...form.register("name")} />
              {form.formState.errors.name && (
                <p className="mt-1 text-destructive text-xs">{form.formState.errors.name.message}</p>
              )}
            </div>
            <div>
              <Label>DOB</Label>
              <Input type="date" {...form.register("dob")} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input {...form.register("phone")} />
              {form.formState.errors.phone && (
                <p className="mt-1 text-destructive text-xs">{form.formState.errors.phone.message}</p>
              )}
            </div>
            <div>
              <Label>Address</Label>
              <Input {...form.register("address")} />
              {form.formState.errors.address && (
                <p className="mt-1 text-destructive text-xs">{form.formState.errors.address.message}</p>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label>City</Label>
                <Input {...form.register("city")} />
              </div>
              <div>
                <Label>State</Label>
                <Input {...form.register("state")} maxLength={2} />
              </div>
              <div>
                <Label>Zip</Label>
                <Input {...form.register("zipcode")} maxLength={5} />
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

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Recipient</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteTarget?.name}&quot;? This action cannot be undone.
            </AlertDialogDescription>
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

function InfoRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value || "-"}</span>
    </div>
  );
}
