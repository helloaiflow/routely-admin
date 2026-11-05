"use client";

import { useCallback, useEffect, useState } from "react";

import { IconLoader2, IconMailForward, IconUserPlus } from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserAvatar } from "@/components/user-avatar";

/* ── Settings → Team: RoutelyPro staff only ───────────────────────────────────
 * Lists and manages the people with a platform_role. Each tenant's users are
 * read-only under Tenants and managed from app.routelypro.com. The server
 * enforces every rule here; this UI is convenience, not security.
 * ─────────────────────────────────────────────────────────────────────────── */

type Role = "super_admin" | "admin" | "support";
type Member = { user_id: string; email: string; full_name: string | null; platform_role: Role; active: boolean };
type Invitation = { id: string; email: string; platform_role: Role; expired: boolean };

const ROLES: Array<{ value: Role; label: string }> = [
  { value: "super_admin", label: "Super admin" },
  { value: "admin", label: "Admin" },
  { value: "support", label: "Support" },
];
const roleLabel = (role: Role) => ROLES.find((r) => r.value === role)?.label ?? role;

export function TeamSection() {
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [me, setMe] = useState<{ user_id: string; platform_role: Role } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("support");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/staff").catch(() => null);
    const body = await res?.json().catch(() => null);
    if (!res?.ok) setError(body?.error ?? "Could not load the team.");
    else {
      setError(null);
      setMembers(body.members ?? []);
      setInvitations(body.invitations ?? []);
      setMe(body.me);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function call(key: string, url: string, method: string, payload: unknown, done: string) {
    setBusy(key);
    setError(null);
    setNotice(null);
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);
    const body = await res?.json().catch(() => null);
    if (res?.ok) {
      setNotice(done);
      await load();
    } else setError(body?.error ?? "That didn't work. Try again.");
    setBusy(null);
    return Boolean(res?.ok);
  }

  async function invite() {
    if (await call("invite", "/api/admin/staff", "POST", { email, platform_role: role }, "Invitation sent.")) setEmail("");
  }

  const canManage = me?.platform_role === "super_admin" || me?.platform_role === "admin";
  const assignable = ROLES.filter((r) => r.value !== "super_admin" || me?.platform_role === "super_admin");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">RoutelyPro team</CardTitle>
        <p className="text-muted-foreground text-sm">
          Staff with access to this console. Tenant users are under Tenants and are managed from app.routelypro.com.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        {notice && <p className="text-muted-foreground text-sm">{notice}</p>}

        {canManage && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-56 flex-1 space-y-1.5">
              <Label htmlFor="staff-email">Email</Label>
              <Input
                id="staff-email"
                type="email"
                spellCheck={false}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="w-40 space-y-1.5">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {assignable.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={invite} disabled={!email || busy === "invite"}>
              {busy === "invite" ? <IconLoader2 className="mr-2 size-4 animate-spin" /> : <IconUserPlus className="mr-2 size-4" />}
              Invite
            </Button>
          </div>
        )}

        {loading ? (
          <IconLoader2 className="size-5 animate-spin text-muted-foreground" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => {
                const locked = !canManage || (m.platform_role === "super_admin" && me?.platform_role !== "super_admin");
                return (
                  <TableRow key={m.user_id}>
                    <TableCell>
                      {/* M24: the same avatar and initials as the sidebar and header. */}
                      <div className="flex min-w-0 items-center gap-2.5">
                        <UserAvatar person={{ fullName: m.full_name, email: m.email }} className="size-7" />
                        <span className="truncate">{m.full_name ?? "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell>{m.email}</TableCell>
                    <TableCell>
                      {locked ? (
                        roleLabel(m.platform_role)
                      ) : (
                        <Select
                          value={m.platform_role}
                          onValueChange={(v) =>
                            call(m.user_id, `/api/admin/staff/${m.user_id}`, "PATCH", { platform_role: v }, "Role updated.")
                          }
                        >
                          <SelectTrigger className="h-8 w-36">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {assignable.map((r) => (
                              <SelectItem key={r.value} value={r.value}>
                                {r.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {!locked && m.user_id !== me?.user_id && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy === m.user_id}
                          onClick={() =>
                            call(m.user_id, `/api/admin/staff/${m.user_id}`, "PATCH", { platform_role: null }, "Removed from the team.")
                          }
                        >
                          Remove
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {invitations.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>
                    <Badge variant="outline">{i.expired ? "Invite expired" : "Pending invite"}</Badge>
                  </TableCell>
                  <TableCell>{i.email}</TableCell>
                  <TableCell>{roleLabel(i.platform_role)}</TableCell>
                  <TableCell className="text-right">
                    {canManage && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy === i.id}
                          onClick={() =>
                            call(i.id, `/api/admin/staff/invitations/${i.id}`, "PATCH", { action: "resend" }, "Invitation sent again.")
                          }
                        >
                          <IconMailForward className="mr-1 size-4" />
                          Resend
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy === i.id}
                          onClick={() =>
                            call(i.id, `/api/admin/staff/invitations/${i.id}`, "PATCH", { action: "revoke" }, "Invitation revoked.")
                          }
                        >
                          Revoke
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
