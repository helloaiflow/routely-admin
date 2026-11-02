"use client";

import { use, useEffect, useState } from "react";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type TenantUser = { name: string | null; email: string; role: string; status: string; last_login: string | null };

export default function TenantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [name, setName] = useState("");
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/admin/tenants/${id}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) return setError(body?.error ?? "Could not load this tenant.");
        setName(body.tenant.name ?? `Tenant ${id}`);
        setUsers(body.users);
      })
      .catch(() => setError("Could not load this tenant."));
  }, [id]);

  return (
    <div className="space-y-4">
      <div>
        <Link href="/dashboard/tenants" className="text-muted-foreground text-sm hover:underline">
          ← Tenants
        </Link>
        <h1 className="font-semibold text-xl tracking-tight md:text-2xl">{name || `Tenant ${id}`}</h1>
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
        </TabsList>
        <TabsContent value="users" className="space-y-2">
          <p className="text-muted-foreground text-sm">Read only. Users are managed from app.routelypro.com.</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last login</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.email}>
                  <TableCell>{u.name ?? "—"}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell className="capitalize">{u.role}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {u.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{u.last_login ? new Date(u.last_login).toLocaleString() : "Never"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>
    </div>
  );
}
