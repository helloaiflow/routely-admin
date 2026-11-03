"use client";

import { use, useEffect, useState } from "react";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type TenantUser = { name: string | null; email: string; role: string; status: string; last_login: string | null };
type Review = { signals?: string[]; flagged_at?: string; approved_at?: string } | null;

// Same wording as app.routelypro.com/src/lib/onboarding/review.ts.
const SIGNAL_TEXT: Record<string, string> = {
  no_mx: "The email domain has no mail server (no MX record)",
  same_ip: "3 or more sign ups from the same IP in 24 hours",
  no_letters: "The name or company has no letters",
};

export default function TenantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [name, setName] = useState("");
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [review, setReview] = useState<Review>(null);
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/tenants/${id}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) return setError(body?.error ?? "Could not load this tenant.");
        setName(body.tenant.name ?? `Tenant ${id}`);
        setStatus(body.tenant.status ?? null);
        setReview(body.tenant.review ?? null);
        setUsers(body.users);
      })
      .catch(() => setError("Could not load this tenant."));
  }, [id]);

  async function approve() {
    setApproving(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/tenants/${id}/approve`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setError(body?.error ?? "Could not approve this tenant.");
      else setStatus(body.status);
    } catch {
      setError("Could not approve this tenant.");
    } finally {
      setApproving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <Link href="/dashboard/tenants" className="text-muted-foreground text-sm hover:underline">
          ← Tenants
        </Link>
        <h1 className="font-semibold text-xl tracking-tight md:text-2xl">{name || `Tenant ${id}`}</h1>
      </div>
      {status === "review" && (
        <section aria-label="Account review" className="space-y-3 rounded-lg border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">In review</Badge>
            <span className="text-muted-foreground text-sm">
              This account can finish setup but cannot create stops until you approve it.
            </span>
          </div>
          {(review?.signals?.length ?? 0) > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {review?.signals?.map((signal) => (
                <li key={signal}>{SIGNAL_TEXT[signal] ?? signal}</li>
              ))}
            </ul>
          )}
          <Button onClick={approve} disabled={approving}>
            {approving ? "Approving…" : "Approve account"}
          </Button>
        </section>
      )}
      {status !== "review" && review?.approved_at && (
        <p className="text-muted-foreground text-sm">
          Approved after review on {new Date(review.approved_at).toLocaleString()}.
        </p>
      )}
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
