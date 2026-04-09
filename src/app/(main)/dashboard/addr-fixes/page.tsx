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
import { Pencil, Plus, Trash2, Wrench, X } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

const API = "https://routelypro.com/api/data/addr-fixes";

const schema = z.object({
  original_address: z.string().min(5),
  fixed_address: z.string().min(5),
  city: z.string().optional(),
  state: z.string().optional(),
  zipcode: z.string().optional(),
  notes: z.string().optional(),
});
type FD = z.infer<typeof schema>;
interface AddrFix {
  _id: string;
  original_address?: string;
  fixed_address?: string;
  city?: string;
  state?: string;
  zipcode?: string;
  notes?: string;
  created_at?: string;
}

export default function AddrFixesPage() {
  const [data, setData] = useState<AddrFix[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AddrFix | null>(null);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AddrFix | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AddrFix | null>(null);
  const [saving, setSaving] = useState(false);
  const form = useForm<FD>({ resolver: zodResolver(schema) });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(API);
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
    if (!search) return data;
    const q = search.toLowerCase();
    return data.filter(
      (r) => r.original_address?.toLowerCase().includes(q) || r.fixed_address?.toLowerCase().includes(q),
    );
  }, [data, search]);

  const cols: ColumnDef<AddrFix>[] = [
    {
      accessorKey: "original_address",
      header: "Original Address",
      cell: ({ row }) => (
        <span className="block max-w-[200px] truncate text-sm text-red-600 line-through">
          {row.original.original_address}
        </span>
      ),
    },
    {
      accessorKey: "fixed_address",
      header: "Fixed Address",
      cell: ({ row }) => (
        <span className="block max-w-[200px] truncate text-sm font-medium text-green-700">
          {row.original.fixed_address}
        </span>
      ),
    },
    { accessorKey: "city", header: "City" },
    {
      accessorKey: "state",
      header: "ST",
      cell: ({ row }) => (
        <Badge variant="outline" className="text-xs">
          {row.original.state || "—"}
        </Badge>
      ),
    },
    {
      accessorKey: "created_at",
      header: "Added",
      cell: ({ row }) =>
        row.original.created_at ? (
          <span className="text-xs">{new Date(row.original.created_at).toLocaleDateString()}</span>
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
    initialState: { pagination: { pageSize: 20 } },
  });
  const openCreate = () => {
    setEditing(null);
    form.reset();
    setDialogOpen(true);
  };
  const openEdit = (r: AddrFix) => {
    setEditing(r);
    form.reset(r);
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
            <h1 className="font-semibold text-2xl">Address Fixes</h1>
            <p className="text-muted-foreground text-sm">{filtered.length} corrections</p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Add Fix
          </Button>
        </div>
        <Input
          placeholder="Search addresses..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-72"
        />
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
                    No address fixes found
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
              <Wrench className="h-5 w-5 text-muted-foreground" />
              <h2 className="font-semibold text-base">Address Fix</h2>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setSelected(null)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-3">
            <Card>
              <CardContent className="space-y-3 pt-4">
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">Original</p>
                  <p className="text-sm text-red-600 line-through">{selected.original_address}</p>
                </div>
                <div className="flex justify-center text-lg text-muted-foreground">↓</div>
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">Fixed</p>
                  <p className="text-sm font-medium text-green-700">{selected.fixed_address}</p>
                </div>
                {selected.city && (
                  <div className="flex gap-2 text-xs text-muted-foreground">
                    <span>{selected.city}</span>
                    <span>{selected.state}</span>
                    <span>{selected.zipcode}</span>
                  </div>
                )}
                {selected.notes && (
                  <div>
                    <p className="mb-1 text-xs text-muted-foreground">Notes</p>
                    <p className="text-sm">{selected.notes}</p>
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
            <DialogTitle>{editing ? "Edit Address Fix" : "Add Address Fix"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3 pt-2">
            <div>
              <Label>Original Address *</Label>
              <Input {...form.register("original_address")} placeholder="As it appears on the label" />
              {form.formState.errors.original_address && (
                <p className="mt-1 text-xs text-red-500">{form.formState.errors.original_address.message}</p>
              )}
            </div>
            <div>
              <Label>Fixed Address *</Label>
              <Input {...form.register("fixed_address")} placeholder="Corrected street address" />
              {form.formState.errors.fixed_address && (
                <p className="mt-1 text-xs text-red-500">{form.formState.errors.fixed_address.message}</p>
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
            <div>
              <Label>Notes</Label>
              <Textarea {...form.register("notes")} rows={2} />
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
            <AlertDialogDescription>Delete this address correction? This cannot be undone.</AlertDialogDescription>
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
