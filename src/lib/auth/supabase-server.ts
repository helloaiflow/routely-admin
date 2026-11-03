import { cache } from "react";

import { cookies } from "next/headers";

import { createServerClient } from "@supabase/ssr";

import { getSupabaseAdmin } from "@/lib/supabase";

export type UserProfile = {
  user_id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  default_office_id: string | null;
  tenant_id: number | null;
  tenant_role: "owner" | "member" | "internal" | null;
  page_permissions: Record<string, unknown>;
  is_platform_admin: boolean;
  active: boolean;
};

export async function createSupabaseServer() {
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() as string,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          try {
            for (const { name, value, options } of list) store.set(name, value, options);
          } catch {
            // Server Components cannot write cookies; the middleware refreshes the session.
          }
        },
      },
    },
  );
}

/** The signed-in web user's row. Tenant and role come only from this table, never from the token. */
export const getSessionProfile = cache(async (): Promise<UserProfile | null> => {
  const supabase = await createSupabaseServer();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub || claims.app_role !== "web") return null;
  const { data: profile } = await getSupabaseAdmin()
    .from("user_profiles")
    .select("*")
    .eq("user_id", claims.sub)
    .eq("active", true)
    .maybeSingle();
  return (profile as UserProfile | null) ?? null;
});
