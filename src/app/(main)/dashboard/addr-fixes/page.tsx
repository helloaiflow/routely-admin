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
import { Pencil, Plus, Trash2 } from "lucide-react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const API = "https://routelypro.com/api/data/addr-fixes";

const schema = z.object({
  full_name: z.string(),
  original_address: z.string().min(5),
  verified_address: z.string().min(5),
  verified_city: z.string(),
  verified_state: z.string().length(2),
  verified_zipcode: z.string().length(5),
  note: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

interface AddrFix {
  _id: string;
  full_name?: string;
  original_address?: string;
  verified_address?: string;
  verified_city?: string;
  verified_state?: string;
  verified_zipcode?: string;
  note?: string;
}

const columns: ColumnDef<AddrFix>[] = [
  {
    accessorKey: "full_name",
    header: "Name",
    cell: ({ row }) => <span className="font-medium">{row.original.full_name || "-"}</span>,
  },
  {
    accessorKey: "original_address",
    header: "Original Address",
    cell: ({ row }) => <span className="block max-w-[180px] truncate">{row.original.original_address || "-"}</span>,
  },
  {
    accessorKey: "verified_address",
    header: "Verified Address",
    cell: ({ row }) => <span className="block max-w-[180px] truncate">{row.original.verified_address || "-"}</span>,
  },
  { accessorKey: "verified_city", header: "City" },
  { accessorKey: "verified_state", header: "State" },
  {
    accessorKey: "note",
    header: "Note",
    cell: ({ row }) => <span className="block max-w-[120px] truncate">{row.original.note || "-"}</span>,
  },
];

export default function AddrFixesPage() {
  const [data, setData] = useState<AddrFix[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AddrFix | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AddrFix | null>(null);
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
        r.full_name?.toLowerCase().includes(q) ||
        r.original_address?.toLowerCase().includes(q) ||
        r.verified_address?.toLowerCase().includes(q),
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
    form.reset({
      full_name: "",
      original_address: "",
      verified_address: "",
      verified_city: "",
      verified_state: "",
      verified_zipcode: "",
      note: "",
    });
    setDialogOpen(true);
  };
  const openEdit = (r: AddrFix) => {
    setEditing(r);
    form.reset({
      full_name: r.full_name || "",
      original_address: r.original_address || "",
      verified_address: r.verified_address || "",
      verified_city: r.verified_city || "",
      verified_state: r.verified_state || "",
      verified_zipcode: r.verified_zipcode || "",
      note: r.note || "",
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
    await fetchData();
  };

  if (loading)
    return (
      <div className="p-6">
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-2xl">Address Fixes</h1>
          <p className="text-muted-foreground text-sm">{filtered.length} address fixes</p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add Fix
        </Button>
      </div>
      <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" />

      <div className="rounded-md border">
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
                  No address fixes found
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} className="hover:bg-muted/50">
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(row.original)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(row.original)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Address Fix" : "Add Address Fix"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            <div>
              <Label>Full Name</Label>
              <Input {...form.register("full_name")} />
            </div>
            <div>
              <Label>Original Address</Label>
              <Input {...form.register("original_address")} />
            </div>
            <div>
              <Label>Verified Address</Label>
              <Input {...form.register("verified_address")} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label>City</Label>
                <Input {...form.register("verified_city")} />
              </div>
              <div>
                <Label>State</Label>
                <Input {...form.register("verified_state")} maxLength={2} />
              </div>
              <div>
                <Label>Zip</Label>
                <Input {...form.register("verified_zipcode")} maxLength={5} />
              </div>
            </div>
            <div>
              <Label>Note</Label>
              <Input {...form.register("note")} />
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
            <AlertDialogTitle>Delete Address Fix</AlertDialogTitle>
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
