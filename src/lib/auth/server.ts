import type { User as ClerkUser } from "@clerk/nextjs/server";
import { auth as clerkAuth, currentUser as clerkCurrentUser } from "@clerk/nextjs/server";

import { USE_SUPABASE_AUTH } from "./provider";
import { getSessionProfile, type UserProfile } from "./supabase-server";

export { clerkClient } from "@clerk/nextjs/server";

/** The fields routes read off a user, whichever provider is active. */
export type User = Pick<ClerkUser, "id" | "firstName" | "lastName"> & {
  emailAddresses: Array<{ emailAddress: string }>;
  primaryEmailAddress?: { emailAddress: string } | null;
  publicMetadata: Record<string, unknown>;
};

export function profileToUser(p: UserProfile): User {
  const [firstName, ...rest] = (p.full_name ?? "").trim().split(/\s+/);
  const email = { emailAddress: p.email };
  return {
    id: p.user_id,
    firstName: firstName || null,
    lastName: rest.join(" ") || null,
    emailAddresses: [email],
    primaryEmailAddress: email,
    publicMetadata: {
      role: p.is_platform_admin ? "routely_admin" : "tenant_user",
      tenant_id: p.tenant_id,
      tenant_role: p.tenant_role,
      phone: p.phone,
      default_office_id: p.default_office_id,
    },
  };
}

export async function auth(): Promise<{ userId: string | null }> {
  if (!USE_SUPABASE_AUTH) return clerkAuth();
  const profile = await getSessionProfile();
  return { userId: profile?.user_id ?? null };
}

export async function currentUser(): Promise<User | null> {
  if (!USE_SUPABASE_AUTH) return (await clerkCurrentUser()) as User | null;
  const profile = await getSessionProfile();
  return profile ? profileToUser(profile) : null;
}

/** How to find the caller's own tenant row: Clerk rows carry the id, Supabase profiles carry the tenant. */
export async function ownTenantFilter(userId: string): Promise<["clerk_user_id" | "tenant_id", string | number]> {
  if (!USE_SUPABASE_AUTH) return ["clerk_user_id", userId];
  return ["tenant_id", (await getSessionProfile())?.tenant_id ?? -1];
}
