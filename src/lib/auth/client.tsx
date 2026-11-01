"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

import * as clerk from "@clerk/nextjs";
import { useSignIn as useClerkSignIn } from "@clerk/nextjs/legacy";
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { USE_SUPABASE_AUTH } from "./provider";

let browserClient: SupabaseClient | null = null;
export function getBrowserSupabase(): SupabaseClient {
  browserClient ??= createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  );
  return browserClient;
}

type Me = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  company_name: string;
  metadata: Record<string, unknown>;
};

type AppUser = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  imageUrl: string;
  primaryPhoneNumber: { phoneNumber: string } | null;
  primaryEmailAddress: { emailAddress: string } | null;
  emailAddresses: Array<{ emailAddress: string }>;
  publicMetadata: Record<string, unknown>;
  reload: () => Promise<unknown>;
  update: (patch: { firstName?: string; lastName?: string }) => Promise<unknown>;
  setProfileImage: (args: { file: File | null }) => Promise<unknown>;
};

type SessionState = { isLoaded: boolean; user: AppUser | null };
const SessionContext = createContext<SessionState>({ isLoaded: false, user: null });

function SupabaseSessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [isLoaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/auth/me").catch(() => null);
    setMe(res?.ok ? ((await res.json()) as Me) : null);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void load();
    const { data } = getBrowserSupabase().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") void load();
    });
    return () => data.subscription.unsubscribe();
  }, [load]);

  const user = useMemo<AppUser | null>(() => {
    if (!me) return null;
    const email = { emailAddress: me.email };
    return {
      id: me.id,
      firstName: me.first_name,
      lastName: me.last_name,
      fullName: me.full_name,
      imageUrl: "",
      primaryPhoneNumber: null,
      primaryEmailAddress: email,
      emailAddresses: [email],
      publicMetadata: { ...me.metadata, companyName: me.company_name },
      reload: load,
      update: async (patch) => {
        const full_name = [patch.firstName, patch.lastName].filter(Boolean).join(" ");
        await fetch("/api/auth/me", { method: "PATCH", body: JSON.stringify({ full_name }) });
        await load();
      },
      setProfileImage: async () => {
        throw new Error("Profile photos are not available yet.");
      },
    };
  }, [me, load]);

  return <SessionContext.Provider value={{ isLoaded, user }}>{children}</SessionContext.Provider>;
}

export function AppAuthProvider({ children }: { children: ReactNode }) {
  if (USE_SUPABASE_AUTH) return <SupabaseSessionProvider>{children}</SupabaseSessionProvider>;
  return <clerk.ClerkProvider>{children}</clerk.ClerkProvider>;
}

type UseUserResult = { isLoaded: boolean; isSignedIn: boolean; user: AppUser | null };
function useSupabaseUser(): UseUserResult {
  const { isLoaded, user } = useContext(SessionContext);
  return { isLoaded, isSignedIn: !!user, user };
}
export const useUser = USE_SUPABASE_AUTH ? useSupabaseUser : (clerk.useUser as unknown as () => UseUserResult);

type UseAuthResult = { isLoaded: boolean; isSignedIn: boolean | undefined };
export const useAuth = USE_SUPABASE_AUTH ? useSupabaseUser : (clerk.useAuth as unknown as () => UseAuthResult);

type SignOutFn = (opts?: { redirectUrl?: string }) => Promise<unknown>;
const signOutSupabase: SignOutFn = async (opts) => {
  await getBrowserSupabase().auth.signOut();
  window.location.assign(opts?.redirectUrl ?? "/login");
};
function useSupabaseClerk() {
  return { signOut: signOutSupabase };
}
export const useClerk = USE_SUPABASE_AUTH ? useSupabaseClerk : (clerk.useClerk as unknown as typeof useSupabaseClerk);

export const useSession = clerk.useSession;

type SignInArgs = { identifier: string; password?: string; strategy?: string };
type FactorArgs = { strategy: string; code: string; password: string };
type SignInResult = { status: string; createdSessionId?: string | null; supportedSecondFactors?: unknown };
type SignInApi = {
  isLoaded: boolean;
  signIn: {
    create: (args: SignInArgs) => Promise<SignInResult>;
    attemptFirstFactor: (args: FactorArgs) => Promise<SignInResult>;
    prepareSecondFactor: (args: Record<string, unknown>) => Promise<unknown>;
    attemptSecondFactor: (args: Record<string, unknown>) => Promise<SignInResult>;
  };
  setActive: (args: { session?: string | null }) => Promise<unknown>;
};

const fail = (message: string) => ({ errors: [{ message, longMessage: message }] });
let resetEmail = "";

const supabaseSignIn: SignInApi = {
  isLoaded: true,
  signIn: {
    async create({ identifier, password, strategy }) {
      const supabase = getBrowserSupabase();
      if (strategy === "reset_password_email_code") {
        resetEmail = identifier;
        const res = await fetch("/api/auth/forgot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: identifier }),
        }).catch(() => null);
        if (!res?.ok) throw fail("We could not send the code. Try again.");
        return { status: "needs_first_factor" };
      }
      const { error } = await supabase.auth.signInWithPassword({ email: identifier, password: password ?? "" });
      if (error) throw fail("Invalid email or password.");
      return { status: "complete", createdSessionId: "supabase" };
    },
    async attemptFirstFactor({ code, password }) {
      const supabase = getBrowserSupabase();
      const { error } = await supabase.auth.verifyOtp({ email: resetEmail, token: code, type: "recovery" });
      if (error) throw fail("Invalid or expired code.");
      const updated = await supabase.auth.updateUser({ password });
      if (updated.error) throw fail(updated.error.message);
      return { status: "complete", createdSessionId: "supabase" };
    },
    prepareSecondFactor: async () => undefined,
    attemptSecondFactor: async () => ({ status: "complete" }),
  },
  setActive: async () => undefined,
};
function useSupabaseSignIn() {
  return supabaseSignIn;
}
export const useSignIn = USE_SUPABASE_AUTH
  ? useSupabaseSignIn
  : (useClerkSignIn as unknown as typeof useSupabaseSignIn);
