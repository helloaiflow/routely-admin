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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const API = "https://routelypro.com/api/data/preset-dropoffs";

const schema = z.object({
  address: z.string().min(5),
  name: z.string().optional(),
  place: z.string().optional(),
  note: z.string().optional(),
  active: z.boolean().optional(),
});
type FormData = z.infer<typeof schema>;

interface Dropoff {
  _id: string;
  address?: string;
  name?: string;
  place?: string;
  note?: string;
  active?: boolean;
}

const columns: ColumnDef<Dropoff>[] = [
  {
    accessorKey: "address",
    header: "Address",
    cell: ({ row }) => <span className="block max-w-[200px] truncate font-medium">{row.original.address || "-"}</span>,
  },
  { accessorKey: "name", header: "Name" },
  { accessorKey: "place", header: "Place" },
  {
    accessorKey: "note",
    header: "Note",
    cell: ({ row }) => <span className="block max-w-[150px] truncate">{row.original.note || "-"}</span>,
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

export default function DropoffsPage() {
  const [data, setData] = useState<Dropoff[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Dropoff | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Dropoff | null>(null);
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
        r.address?.toLowerCase().includes(q) || r.name?.toLowerCase().includes(q) || r.place?.toLowerCase().includes(q),
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
    form.reset({ address: "", name: "", place: "", note: "", active: true });
    setDialogOpen(true);
  };
  const openEdit = (r: Dropoff) => {
    setEditing(r);
    form.reset({
      address: r.address || "",
      name: r.name || "",
      place: r.place || "",
      note: r.note || "",
      active: r.active !== false,
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
          <h1 className="font-semibold text-2xl">Drop-offs</h1>
          <p className="text-muted-foreground text-sm">{filtered.length} drop-off locations</p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add Drop-off
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
                  No drop-offs found
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
            <DialogTitle>{editing ? "Edit Drop-off" : "Add Drop-off"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            <div>
              <Label>Address</Label>
              <Input {...form.register("address")} />
            </div>
            <div>
              <Label>Name</Label>
              <Input {...form.register("name")} />
            </div>
            <div>
              <Label>Place</Label>
              <Input {...form.register("place")} />
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
            <AlertDialogTitle>Delete Drop-off</AlertDialogTitle>
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
