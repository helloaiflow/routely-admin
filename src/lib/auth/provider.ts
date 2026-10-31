// D62: Supabase Auth replaces Clerk. Rollback = set this env back to "clerk" and redeploy.
export const AUTH_PROVIDER = process.env.NEXT_PUBLIC_AUTH_PROVIDER === "supabase" ? "supabase" : "clerk";
export const USE_SUPABASE_AUTH = AUTH_PROVIDER === "supabase";
