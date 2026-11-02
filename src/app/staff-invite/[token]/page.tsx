"use client";

import { type FormEvent, use, useEffect, useState } from "react";

import Link from "next/link";

import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getBrowserSupabase } from "@/lib/auth/client";

type Invite = { email: string; role: string; existing: boolean };

export default function StaffInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "invalid" | "done">("loading");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/staff-invite/${token}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        setInvite(body);
        setState(body ? "ready" : "invalid");
      })
      .catch(() => setState("invalid"));
  }, [token]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!invite) return;
    setSaving(true);
    setError("");
    const res = await fetch(`/api/staff-invite/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_name: name, password }),
    }).catch(() => null);
    const body = await res?.json().catch(() => null);
    if (!res?.ok) {
      setSaving(false);
      setError(body?.error ?? "We could not accept the invitation.");
      return;
    }
    if (invite.existing) {
      setState("done");
      return;
    }
    const { error: signInError } = await getBrowserSupabase().auth.signInWithPassword({ email: invite.email, password });
    if (signInError) setState("done");
    else window.location.replace("/dashboard/default");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-4">
        {state === "loading" && <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />}
        {state === "invalid" && (
          <>
            <h1 className="font-semibold text-xl tracking-tight">This invitation isn't valid</h1>
            <p className="text-muted-foreground text-sm">Ask your admin to send a new one.</p>
          </>
        )}
        {state === "done" && (
          <>
            <h1 className="font-semibold text-xl tracking-tight">You're on the team</h1>
            <p className="text-muted-foreground text-sm">
              <Link href="/login" className="underline">
                Log in
              </Link>{" "}
              to the admin console.
            </p>
          </>
        )}
        {state === "ready" && invite && (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <h1 className="font-semibold text-xl tracking-tight">Join the RoutelyPro team</h1>
              <p className="text-muted-foreground text-sm">
                {invite.email} · {invite.role}
              </p>
            </div>
            {!invite.existing && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="name">Full name</Label>
                  <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="8+ characters and a number"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </>
            )}
            {error && (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={saving}>
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
              Accept invitation
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
