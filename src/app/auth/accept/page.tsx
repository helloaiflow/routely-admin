"use client";

import { type FormEvent, useEffect, useState } from "react";

import Link from "next/link";

import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getBrowserSupabase } from "@/lib/auth/client";

/** Landing page of a Supabase invite or recovery link: the tokens arrive in the URL hash. */
export default function AcceptInvitePage() {
  const [state, setState] = useState<"loading" | "ready" | "invalid">("loading");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    if (!access_token || !refresh_token) {
      setState("invalid");
      return;
    }
    getBrowserSupabase()
      .auth.setSession({ access_token, refresh_token })
      .then(({ error: sessionError }) => {
        window.history.replaceState(null, "", window.location.pathname);
        setState(sessionError ? "invalid" : "ready");
      });
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords do not match.");
    setSaving(true);
    setError("");
    const { error: updateError } = await getBrowserSupabase().auth.updateUser({ password });
    if (updateError) {
      setSaving(false);
      return setError(updateError.message);
    }
    await fetch("/api/auth/accepted", { method: "POST" });
    window.location.replace("/dashboard/default");
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        {state === "loading" && <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />}
        {state === "invalid" && (
          <div className="space-y-2 text-center">
            <h1 className="type-page-title">This link is no longer valid</h1>
            <p className="type-desc">Ask for a new invitation, or reset your password from the sign in page.</p>
            <Link href="/login" className="text-primary text-sm hover:underline">
              Back to sign in
            </Link>
          </div>
        )}
        {state === "ready" && (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <h1 className="type-page-title">Set your password</h1>
              <p className="type-desc">You will use it to sign in to Routely.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : "Continue"}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
