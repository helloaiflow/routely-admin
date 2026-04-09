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
import { MapPin, Pencil, Plus, Trash2, X } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

const API = "https://routelypro.com/api/data/dropoffs";

const schema = z.object({
  name: z.string().min(2),
  address: z.string().min(5),
  city: z.string().optional(),
  state: z.string().optional(),
  zipcode: z.string().optional(),
  instructions: z.string().optional(),
  active: z.boolean().optional(),
});
type FD = z.infer<typeof schema>;
interface Dropoff {
  _id: string;
  name?: string;
  address?: string;
  city?: string;
  state?: string;
  zipcode?: string;
  instructions?: string;
  active?: boolean;
  created_at?: string;
}

export default function DropoffsPage() {
  const [data, setData] = useState<Dropoff[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Dropoff | null>(null);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Dropoff | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Dropoff | null>(null);
  const [saving, setSaving] = useState(false);
  const form = useForm<FD>({ resolver: zodResolver(schema), defaultValues: { active: true } });

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
    return data.filter((r) => r.name?.toLowerCase().includes(q) || r.address?.toLowerCase().includes(q));
  }, [data, search]);

  const cols: ColumnDef<Dropoff>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    {
      accessorKey: "address",
      header: "Address",
      cell: ({ row }) => <span className="block max-w-[220px] truncate text-sm">{row.original.address}</span>,
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
    form.reset({ active: true });
    setDialogOpen(true);
  };
  const openEdit = (r: Dropoff) => {
    setEditing(r);
    form.reset({ ...r, active: r.active !== false });
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
            <h1 className="font-semibold text-2xl">Drop-off Locations</h1>
            <p className="text-muted-foreground text-sm">
              {data.filter((d) => d.active !== false).length} active · {data.length} total
            </p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Add Drop-off
          </Button>
        </div>
        <Input
          placeholder="Search drop-offs..."
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
                    No drop-offs found
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
              <MapPin className="h-5 w-5 text-muted-foreground" />
              <h2 className="font-semibold text-base">{selected.name}</h2>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setSelected(null)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-3">
            <Card>
              <CardContent className="space-y-2 pt-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Address: </span>
                  <span className="font-medium">{selected.address}</span>
                </div>
                {selected.city && (
                  <div>
                    <span className="text-muted-foreground">City: </span>
                    <span>
                      {selected.city}, {selected.state} {selected.zipcode}
                    </span>
                  </div>
                )}
                {selected.instructions && (
                  <div>
                    <span className="text-muted-foreground">Instructions: </span>
                    <span>{selected.instructions}</span>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Status: </span>
                  <Badge variant={selected.active !== false ? "default" : "secondary"}>
                    {selected.active !== false ? "Active" : "Inactive"}
                  </Badge>
                </div>
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Drop-off" : "Add Drop-off"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3 pt-2">
            <div>
              <Label>Name *</Label>
              <Input {...form.register("name")} />
            </div>
            <div>
              <Label>Address *</Label>
              <Input {...form.register("address")} />
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
              <Label>Instructions</Label>
              <Textarea {...form.register("instructions")} rows={2} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.watch("active")} onCheckedChange={(v) => form.setValue("active", v)} />
              <Label>Active</Label>
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
