"use client";

import { useCallback, useEffect, useState } from "react";

import { IconLoader2, IconMailForward, IconUserPlus } from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/* ── Settings → Team (member-system Phase 3, owner-only) ─────────────────────
 * Invite members by email (Clerk invitation link), see pending/active/
 * deactivated members, toggle page permissions inline, revoke pending invites,
 * deactivate/reactivate members. Never hard-deletes (audit). The server
 * enforces owner-only on every endpoint — this UI is convenience, not security.
 * ─────────────────────────────────────────────────────────────────────────── */

type PagePerms = { orders: boolean; billing: boolean; reports: boolean; settings: boolean };

type Member = {
  id: string;
  email: string;
  role: "owner" | "member";
  active: boolean;
  pending: boolean;
  invitation_status: string | null;
  page_permissions: PagePerms;
};

const PERM_KEYS: Array<{ key: keyof PagePerms; label: string }> = [
  { key: "orders", label: "Orders" },
  { key: "billing", label: "Billing" },
  { key: "reports", label: "Reports" },
  { key: "settings", label: "Settings" },
];

const DEFAULT_INVITE_PERMS: PagePerms = { orders: true, billing: false, reports: false, settings: false };

export function TeamSection() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePerms, setInvitePerms] = useState<PagePerms>(DEFAULT_INVITE_PERMS);
  const [inviting, setInviting] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/client/members");
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
      const data = await res.json();
      setMembers(data.members ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load team");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const invite = async () => {
    setInviting(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/client/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, page_permissions: invitePerms }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setNotice(`Invitation sent to ${inviteEmail.trim().toLowerCase()}.`);
      setInviteEmail("");
      setInvitePerms(DEFAULT_INVITE_PERMS);
      setInviteOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invite failed");
    } finally {
      setInviting(false);
    }
  };

  const patchMember = async (id: string, payload: Record<string, unknown>) => {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/client/members/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  };

  const togglePerm = (m: Member, key: keyof PagePerms) => {
    const next = { ...m.page_permissions, [key]: !m.page_permissions[key] };
    // Optimistic paint; server result reconciles via load().
    setMembers((prev) => prev.map((x) => (x.id === m.id ? { ...x, page_permissions: next } : x)));
    void patchMember(m.id, { action: "permissions", page_permissions: next });
  };

  const statusBadge = (m: Member) => {
    if (m.role === "owner") return <Badge>Owner</Badge>;
    if (m.pending) return <Badge variant="outline">Pending invite</Badge>;
    if (m.invitation_status === "revoked") return <Badge variant="secondary">Revoked</Badge>;
    if (!m.active) return <Badge variant="secondary">Deactivated</Badge>;
    return <Badge variant="default">Active</Badge>;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="type-section-title">Team</h3>
          <p className="text-muted-foreground text-sm">
            Invite members and control which pages they can access. Every order they create belongs to
            your organization.
          </p>
        </div>
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogTrigger asChild>
            <Button className="h-9 shrink-0">
              <IconUserPlus className="size-4" /> Invite member
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Invite a member</DialogTitle>
              <DialogDescription>They&apos;ll get an email link to join your workspace.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="invite-email" className="font-medium text-sm">
                  Email address
                </Label>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="member@company.com"
                  className="h-9"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="font-medium text-sm">Page access</Label>
                <div className="grid grid-cols-2 gap-2">
                  {PERM_KEYS.map(({ key, label }) => (
                    <label
                      key={key}
                      className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm transition-colors hover:bg-muted/40"
                    >
                      <Switch
                        checked={invitePerms[key]}
                        onCheckedChange={(v) => setInvitePerms((p) => ({ ...p, [key]: v === true }))}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
              {error && <p className="text-destructive text-sm">{error}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setInviteOpen(false)} disabled={inviting}>
                Cancel
              </Button>
              <Button onClick={invite} disabled={inviting || inviteEmail.trim() === ""}>
                {inviting ? <IconLoader2 className="size-4 animate-spin" /> : <IconMailForward className="size-4" />}
                Send invitation
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {notice && <p className="text-success text-sm">{notice}</p>}

      {/* Members card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Members</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <div className="flex items-center gap-2 py-6 text-muted-foreground text-sm">
              <IconLoader2 className="size-4 animate-spin" /> Loading team…
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    {PERM_KEYS.map(({ key, label }) => (
                      <TableHead key={key} className="text-center">
                        {label}
                      </TableHead>
                    ))}
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.email}</TableCell>
                      <TableCell>{statusBadge(m)}</TableCell>
                      {PERM_KEYS.map(({ key }) => (
                        <TableCell key={key} className="text-center">
                          {m.role === "owner" ? (
                            <span className="text-muted-foreground text-xs">Full</span>
                          ) : (
                            <Switch
                              checked={m.page_permissions[key]}
                              disabled={busyId === m.id || m.invitation_status === "revoked"}
                              onCheckedChange={() => togglePerm(m, key)}
                            />
                          )}
                        </TableCell>
                      ))}
                      <TableCell className="text-right">
                        {m.role === "owner" ? null : m.pending ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8"
                            disabled={busyId === m.id}
                            onClick={() => void patchMember(m.id, { action: "revoke" })}
                          >
                            Revoke invite
                          </Button>
                        ) : m.active ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8"
                            disabled={busyId === m.id}
                            onClick={() => void patchMember(m.id, { action: "deactivate" })}
                          >
                            Deactivate
                          </Button>
                        ) : m.invitation_status === "revoked" ? null : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8"
                            disabled={busyId === m.id}
                            onClick={() => void patchMember(m.id, { action: "reactivate" })}
                          >
                            Reactivate
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {members.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center text-muted-foreground text-sm">
                        No team members yet — send your first invitation above.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
