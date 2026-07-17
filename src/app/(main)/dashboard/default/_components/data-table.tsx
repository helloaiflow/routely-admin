"use client";
"use no memo";

import * as React from "react";

import {
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type PaginationState,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  ArrowUpDown,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CircleAlert,
  Clock3,
  LoaderIcon,
  Package,
  Pill,
  Search,
  Snowflake,
  Truck,
  UserRound,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Delivery {
  id: string;
  recipient: string;
  phone: string;
  status: "pending" | "in_transit" | "delivered" | "failed";
  package_type: "rx" | "cold" | "regular";
  city: string;
  date: string;
}

const MOCK_DELIVERIES: Delivery[] = [
  {
    id: "RTL-00124",
    recipient: "DIAZ, ZULMA",
    phone: "(561) 555-0101",
    status: "delivered",
    package_type: "rx",
    city: "Boca Raton",
    date: "Apr 29, 2026",
  },
  {
    id: "RTL-00123",
    recipient: "GARCIA, PEDRO",
    phone: "(754) 555-0202",
    status: "in_transit",
    package_type: "cold",
    city: "Deerfield Beach",
    date: "Apr 29, 2026",
  },
  {
    id: "RTL-00122",
    recipient: "MARTINEZ, LISA",
    phone: "(305) 555-0303",
    status: "pending",
    package_type: "regular",
    city: "Coral Springs",
    date: "Apr 28, 2026",
  },
  {
    id: "RTL-00121",
    recipient: "JOHNSON, MARK",
    phone: "(561) 555-0404",
    status: "failed",
    package_type: "rx",
    city: "Boynton Beach",
    date: "Apr 28, 2026",
  },
  {
    id: "RTL-00120",
    recipient: "WILSON, ANA",
    phone: "(954) 555-0505",
    status: "delivered",
    package_type: "cold",
    city: "Pompano Beach",
    date: "Apr 27, 2026",
  },
];

const STATUS_LABELS: Record<Delivery["status"], string> = {
  pending: "Pending",
  in_transit: "In Transit",
  delivered: "Delivered",
  failed: "Failed",
};

const PACKAGE_LABELS: Record<Delivery["package_type"], string> = {
  rx: "Rx",
  cold: "Cold Chain",
  regular: "Standard",
};

function statusIcon(status: Delivery["status"]) {
  switch (status) {
    case "delivered":
      return <CheckCircle2 className="fill-emerald-500 stroke-primary-foreground dark:fill-emerald-600" />;
    case "in_transit":
      return <Truck className="text-primary" />;
    case "pending":
      return <Clock3 className="text-muted-foreground" />;
    case "failed":
      return <CircleAlert className="text-amber-600 dark:text-amber-500" />;
    default:
      return <LoaderIcon />;
  }
}

function packageIcon(type: Delivery["package_type"]) {
  switch (type) {
    case "rx":
      return <Pill className="size-3.5" />;
    case "cold":
      return <Snowflake className="size-3.5" />;
    case "regular":
      return <Package className="size-3.5" />;
  }
}

const statusOptions = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "in_transit", label: "In Transit" },
  { value: "delivered", label: "Delivered" },
  { value: "failed", label: "Failed" },
] as const;

const dateOptions = [
  { value: "all", label: "All time" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
] as const;

const sortOptions = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name-asc", label: "Recipient A-Z" },
  { value: "name-desc", label: "Recipient Z-A" },
] as const;

const columns: ColumnDef<Delivery>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <div className="flex items-center justify-center">
        <Checkbox
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      </div>
    ),
    cell: ({ row }) => (
      <div className="flex items-center justify-center">
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label={`Select ${row.original.recipient}`}
        />
      </div>
    ),
    enableHiding: false,
  },
  {
    accessorKey: "recipient",
    header: "Recipient",
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-md border bg-muted">
          <UserRound className="size-4 text-muted-foreground" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="grid min-w-0 gap-0.5">
            <span className="truncate font-medium text-sm leading-none">{row.original.recipient}</span>
            <span className="truncate text-muted-foreground text-xs leading-none">{row.original.phone}</span>
          </div>
        </div>
      </div>
    ),
    enableHiding: false,
  },
  {
    id: "search",
    accessorFn: (row) => `${row.id} ${row.recipient} ${row.phone} ${row.city}`,
    filterFn: "includesString",
    enableHiding: true,
  },
  {
    accessorKey: "status",
    header: "Status",
    filterFn: "equalsString",
    cell: ({ row }) => (
      <Badge variant="outline" className="px-1.5 text-muted-foreground">
        {statusIcon(row.original.status)}
        {STATUS_LABELS[row.original.status]}
      </Badge>
    ),
  },
  {
    accessorKey: "package_type",
    header: "Package",
    cell: ({ row }) => (
      <Badge variant="outline" className="px-1.5 text-muted-foreground">
        {packageIcon(row.original.package_type)}
        {PACKAGE_LABELS[row.original.package_type]}
      </Badge>
    ),
  },
  {
    accessorKey: "city",
    header: "Zone",
    cell: ({ row }) => <span className="text-sm">{row.original.city}</span>,
  },
  {
    id: "dateWindow",
    accessorFn: () => ["7", "30"],
    filterFn: "arrIncludes",
    enableHiding: true,
  },
  {
    accessorKey: "date",
    header: "Date",
    cell: ({ row }) => <span className="text-sm">{row.original.date}</span>,
  },
];

export function DataTable() {
  const [rowSelection, setRowSelection] = React.useState({});
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = React.useState<SortingState>([{ id: "date", desc: true }]);
  const [columnVisibility] = React.useState<VisibilityState>({
    search: false,
    dateWindow: false,
  });
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });

  const table = useReactTable({
    data: MOCK_DELIVERIES,
    columns,
    state: { rowSelection, columnFilters, sorting, columnVisibility, pagination },
    getRowId: (row) => row.id,
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onColumnFiltersChange: setColumnFilters,
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const searchQuery = (table.getColumn("search")?.getFilterValue() as string) ?? "";
  const statusFilter = (table.getColumn("status")?.getFilterValue() as string) ?? "all";
  const dateFilter = (table.getColumn("dateWindow")?.getFilterValue() as string) ?? "all";
  const sortValue = React.useMemo(() => {
    const current = sorting[0];
    if (!current) return "newest";
    if (current.id === "date" && current.desc) return "newest";
    if (current.id === "date" && !current.desc) return "oldest";
    if (current.id === "recipient" && !current.desc) return "name-asc";
    if (current.id === "recipient" && current.desc) return "name-desc";
    return "newest";
  }, [sorting]);

  return (
    <div className="rounded-xl bg-card py-4 ring-1 ring-foreground/10">
      <div className="space-y-4 px-4">
        <div>
          <h3 className="type-card-title">Recent Deliveries</h3>
          <p className="text-muted-foreground text-sm">Latest orders from your account</p>
        </div>

        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full lg:w-80">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-7 rounded-[min(var(--radius-md),12px)] pl-8"
                placeholder="Search deliveries..."
                value={searchQuery}
                onChange={(event) => {
                  table.getColumn("search")?.setFilterValue(event.target.value || undefined);
                  table.setPageIndex(0);
                }}
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Truck />
                  Status
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-40" align="start">
                <DropdownMenuRadioGroup
                  value={statusFilter}
                  onValueChange={(value) => {
                    table.getColumn("status")?.setFilterValue(value === "all" ? undefined : value);
                    table.setPageIndex(0);
                  }}
                >
                  {statusOptions.map((opt) => (
                    <DropdownMenuRadioItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <CalendarDays />
                  Date
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-40" align="start">
                <DropdownMenuRadioGroup
                  value={dateFilter}
                  onValueChange={(value) => {
                    table.getColumn("dateWindow")?.setFilterValue(value === "all" ? undefined : value);
                    table.setPageIndex(0);
                  }}
                >
                  {dateOptions.map((opt) => (
                    <DropdownMenuRadioItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center xl:w-auto">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <ArrowUpDown />
                  Sort
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuRadioGroup
                  value={sortValue}
                  onValueChange={(value) => {
                    const next: SortingState =
                      value === "oldest"
                        ? [{ id: "date", desc: false }]
                        : value === "name-asc"
                          ? [{ id: "recipient", desc: false }]
                          : value === "name-desc"
                            ? [{ id: "recipient", desc: true }]
                            : [{ id: "date", desc: true }];
                    table.setSorting(next);
                    table.setPageIndex(0);
                  }}
                >
                  {sortOptions.map((opt) => (
                    <DropdownMenuRadioItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border bg-card">
          <Table>
            <TableHeader className="bg-muted/15">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id} colSpan={header.colSpan} className="h-11 p-3 font-medium">
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id} data-state={row.getIsSelected() && "selected"} className="hover:bg-muted/50">
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="p-3 align-middle">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={table.getVisibleLeafColumns().length} className="h-24 text-center">
                    No results.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between px-1">
          <div className="hidden flex-1 text-muted-foreground text-sm lg:flex">
            {table.getFilteredSelectedRowModel().rows.length} of {table.getFilteredRowModel().rows.length} row(s)
            selected.
          </div>
          <div className="flex w-full items-center gap-8 lg:w-fit">
            <div className="hidden items-center gap-2 lg:flex">
              <Label htmlFor="deliveries-rows-per-page" className="font-medium text-sm">
                Rows per page
              </Label>
              <Select
                value={`${table.getState().pagination.pageSize}`}
                onValueChange={(value) => table.setPageSize(Number(value))}
              >
                <SelectTrigger size="sm" className="w-20" id="deliveries-rows-per-page">
                  <SelectValue placeholder={table.getState().pagination.pageSize} />
                </SelectTrigger>
                <SelectContent side="top">
                  <SelectGroup>
                    {[10, 20, 30, 40, 50].map((pageSize) => (
                      <SelectItem key={pageSize} value={`${pageSize}`}>
                        {pageSize}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="flex w-fit items-center justify-center font-medium text-sm">
              Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
            </div>
            <div className="ml-auto flex items-center gap-2 lg:ml-0">
              <Button
                variant="outline"
                className="hidden size-8 lg:flex"
                size="icon"
                onClick={() => table.setPageIndex(0)}
                disabled={!table.getCanPreviousPage()}
              >
                <span className="sr-only">First page</span>
                <ChevronsLeft className="size-4" />
              </Button>
              <Button
                variant="outline"
                className="size-8"
                size="icon"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                <span className="sr-only">Previous page</span>
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="outline"
                className="size-8"
                size="icon"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                <span className="sr-only">Next page</span>
                <ChevronRight className="size-4" />
              </Button>
              <Button
                variant="outline"
                className="hidden size-8 lg:flex"
                size="icon"
                onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                disabled={!table.getCanNextPage()}
              >
                <span className="sr-only">Last page</span>
                <ChevronsRight className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
