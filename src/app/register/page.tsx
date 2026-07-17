"use client";

import { Suspense } from "react";

import { SignUp } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";

/* ── /register — member-invitation acceptance ─────────────────────────────────
 * Member-system Phase 3 (2026-06-11). This page exists ONLY to accept Clerk
 * invitations: the owner invites a member from Settings → Team, Clerk emails a
 * link that lands here with a `__clerk_ticket` param, and <SignUp> consumes the
 * ticket (email locked, invitee sets a password, publicMetadata
 * {role, tenant_id, tenant_role:"member"} stamped by Clerk at creation).
 *
 * Origin rule (CEO-locked): the PUBLIC signup flow lives on routelypro.com and
 * only produces tenant OWNERS. Anyone landing here without a ticket is sent
 * there — app.routelypro.com never offers open self-registration.
 * ─────────────────────────────────────────────────────────────────────────── */

function RegisterInner() {
  const params = useSearchParams();
  const ticket = params.get("__clerk_ticket");

  if (!ticket) {
    if (typeof window !== "undefined") {
      window.location.replace("https://routelypro.com/register");
    }
    return null;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="flex flex-col items-center gap-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold">Join your team on Routely</h1>
          <p className="text-sm text-muted-foreground">
            You&apos;ve been invited — create your account to get started.
          </p>
        </div>
        <SignUp forceRedirectUrl="/dashboard/default" />
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterInner />
    </Suspense>
  );
}
