"use client";

import { useEffect, useState } from "react";

import Link from "next/link";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Array<{ tenant_id: number; name: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/tenants")
      .then((res) => res.json())
      .then((body) => setTenants(body.tenants ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-semibold text-xl tracking-tight md:text-2xl">Tenants</h1>
        <p className="text-muted-foreground text-sm">Companies on Routely.</p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-24">ID</TableHead>
            <TableHead>Company</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tenants.map((t) => (
            <TableRow key={t.tenant_id}>
              <TableCell className="font-mono tabular-nums">{t.tenant_id}</TableCell>
              <TableCell>
                <Link href={`/dashboard/tenants/${t.tenant_id}`} className="hover:underline">
                  {t.name}
                </Link>
              </TableCell>
            </TableRow>
          ))}
          {!loading && tenants.length === 0 && (
            <TableRow>
              <TableCell colSpan={2} className="text-muted-foreground text-sm">
                No tenants.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
