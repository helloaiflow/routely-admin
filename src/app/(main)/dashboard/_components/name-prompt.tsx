"use client";

import { useEffect, useState } from "react";

import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUser } from "@/lib/auth/client";
import { getFullName, personOf } from "@/lib/user-display";

const ASKED_KEY = "routely_name_asked";

/** Marks the prompt as shown for this user on this device; false when it was shown before. */
function firstAsk(userId: string) {
  try {
    const key = `${ASKED_KEY}:${userId}`;
    if (localStorage.getItem(key)) return false;
    localStorage.setItem(key, "1");
  } catch {
    // Without storage it may ask again on a later visit; Settings → Account still has the field.
  }
  return true;
}

/** M24: a profile without full_name gets one small ask, once. It waits while another dialog is
 * open and tries again on the next visit. */
export function NamePrompt() {
  const { user } = useUser();
  const missing = Boolean(user) && !getFullName(personOf(user));
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!missing || !user) return;
    const timer = setTimeout(() => {
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      if (firstAsk(user.id)) setOpen(true);
    }, 800);
    return () => clearTimeout(timer);
  }, [missing, user]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const fullName = name.trim().replace(/\s+/g, " ");
    if (fullName.length < 2) {
      setError("Enter your full name");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/auth/me", { method: "PATCH", body: JSON.stringify({ full_name: fullName }) });
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error || "Could not save your name. Try again.");
        return;
      }
      await user?.reload();
      setOpen(false);
    } catch {
      setError("Could not save your name. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={save} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>What's your name?</DialogTitle>
            <DialogDescription>It shows on your avatar and to your team.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="name-prompt" className="font-medium text-sm">
              Full name
            </Label>
            <Input
              id="name-prompt"
              autoComplete="name"
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError("");
              }}
              className="h-9"
              aria-invalid={Boolean(error)}
            />
            {error && (
              <p role="alert" className="text-destructive text-xs">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" className="h-9" onClick={() => setOpen(false)}>
              Not now
            </Button>
            <Button type="submit" size="sm" className="h-9" disabled={saving || !name.trim()}>
              {saving ? <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" /> : null}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
