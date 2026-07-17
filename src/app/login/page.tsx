"use client";

import { Suspense, useEffect, useState } from "react";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { useAuth, useClerk } from "@clerk/nextjs";
import { useSignIn } from "@clerk/nextjs/legacy";
import { ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { LogisticsWorld } from "./_components/logistics-world";

function LoginContent() {
  const { isSignedIn } = useAuth();
  const { isLoaded, signIn, setActive } = useSignIn();
  const { signOut } = useClerk();
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Client Trust state — new device verification via email OTP
  const [verifying, setVerifying] = useState(false);
  const [verifyCode, setVerifyCode] = useState("");
  const [verifyError, setVerifyError] = useState("");

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      window.location.replace("/dashboard/default");
    }
  }, [isLoaded, isSignedIn]);

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isSignedIn) {
    window.location.replace("/dashboard/default");
    return null;
  }

  const attemptSignIn = async (identifier: string, pwd: string) => {
    if (!signIn) throw new Error("signIn not ready");
    return await signIn.create({ identifier, password: pwd });
  };

  // Sends OTP email to verify new device (Client Trust flow)
  const sendVerificationCode = async () => {
    if (!signIn) return;
    try {
      await signIn.prepareSecondFactor({ strategy: "email_code" });
      setVerifying(true);
    } catch {
      setError("Could not send verification code. Please try again.");
    }
  };

  // Verifies the OTP entered by the user
  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signIn || !verifyCode.trim()) return;
    setVerifyError("");
    setLoading(true);
    try {
      const result = await signIn.attemptSecondFactor({
        strategy: "email_code",
        code: verifyCode.trim(),
      });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        window.location.replace("/dashboard/default");
      } else {
        setVerifyError("Verification incomplete. Please try again.");
      }
    } catch {
      setVerifyError("Invalid code. Please check your email and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signIn) return;
    if (!email || !password) {
      setError("Please enter your email and password.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const result = await attemptSignIn(email, password);

      // Clerk Client Trust — new device requires OTP verification
      if ((result.status as string) === "needs_client_trust") {
        await sendVerificationCode();
        return;
      }

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        window.location.replace("/dashboard/default");
      } else {
        setError(`Sign in incomplete. (status:${result.status})`);
      }
    } catch (err: unknown) {
      const clerkErr = err as { errors?: Array<{ code?: string; longMessage?: string; message?: string }> };
      const code = clerkErr.errors?.[0]?.code;
      const msg = clerkErr.errors?.[0]?.longMessage ?? clerkErr.errors?.[0]?.message;
      if (code === "session_exists") {
        try {
          await signOut();
          const result = await attemptSignIn(email, password);
          if (result.status === "complete") {
            await setActive({ session: result.createdSessionId });
            window.location.replace("/dashboard/default");
            return;
          }
        } catch (retryErr) {
          const re = retryErr as { errors?: Array<{ code?: string; longMessage?: string; message?: string }> };
          const rc = re?.errors?.[0]?.code;
          if (rc === "form_password_incorrect") {
            setError("Incorrect password. Please try again.");
          } else {
            setError(re?.errors?.[0]?.longMessage ?? "Sign in failed.");
          }
        }
        return;
      }
      if (code === "form_password_incorrect") {
        setError("Incorrect password. Please try again.");
      } else if (code === "form_identifier_not_found") {
        setError("No account found with this email address.");
      } else if (code === "too_many_requests") {
        setError("Too many attempts. Please wait and try again.");
      } else {
        setError(`${msg ?? "Sign in failed."} (${code ?? "unknown"})`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-dvh bg-background">
      {/* Mobile shows ONLY the form — no hero image, titles, or animation. */}
      <div className="grid min-h-dvh p-1.5 lg:h-dvh lg:grid-cols-[minmax(360px,25%)_1fr] lg:gap-1">
        {/* LEFT — form panel */}
        <div className="relative order-1 flex h-full flex-col items-center justify-center rounded-2xl bg-background lg:rounded-none">
          <div className="absolute top-5 right-6 hidden text-muted-foreground text-sm lg:block">
            Don&apos;t have an account?{" "}
            <Link
              href="https://routelypro.com/register"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Register
            </Link>
          </div>

          <div className="w-full max-w-[300px] px-4">
            <div className="mb-6 flex flex-col items-center gap-2.5">
              <Image
                src="/img/routelyLogoBlack.svg"
                alt="Routely"
                width={180}
                height={60}
                className="w-36 dark:invert"
                priority
              />
              <div className="h-px w-10 bg-border" />
            </div>

            {/* ── Client Trust OTP screen ── */}
            {verifying ? (
              <div>
                <div className="mb-5 space-y-1 text-center">
                  <h1 className="font-semibold text-2xl tracking-tight">Verify your device</h1>
                  <p className="text-muted-foreground text-sm">
                    We sent a 6-digit code to <strong>{email}</strong>. Enter it below.
                  </p>
                </div>

                <form onSubmit={handleVerifyCode} className="space-y-3.5">
                  <div className="space-y-1.5">
                    <Label htmlFor="code" className="font-medium text-sm">
                      Verification code
                    </Label>
                    <Input
                      id="code"
                      type="text"
                      inputMode="numeric"
                      placeholder="000000"
                      value={verifyCode}
                      onChange={(e) => {
                        setVerifyCode(e.target.value.replace(/\D/g, ""));
                        setVerifyError("");
                      }}
                      className="h-10 text-center font-mono text-lg tracking-widest focus-visible:border-primary focus-visible:ring-primary/30"
                      maxLength={6}
                      autoFocus
                    />
                  </div>

                  {verifyError && <p className="text-center text-destructive text-xs">{verifyError}</p>}

                  <Button
                    type="submit"
                    disabled={loading || verifyCode.length < 6}
                    className="h-11 w-full gap-1.5 font-semibold text-white shadow-lg transition-all hover:opacity-90 active:scale-[0.98]"
                    style={{ backgroundColor: "var(--primary)", boxShadow: "0 4px 24px 0 var(--primary-glow)" }}
                  >
                    {loading ? (
                      <>
                        <Loader2 size={15} className="animate-spin" />
                        Verifying…
                      </>
                    ) : (
                      <>
                        Verify
                        <ArrowRight className="size-4" aria-hidden="true" />
                      </>
                    )}
                  </Button>

                  <button
                    type="button"
                    onClick={() => {
                      setVerifying(false);
                      setVerifyCode("");
                      setVerifyError("");
                      setError("");
                    }}
                    className="w-full text-center text-muted-foreground text-xs hover:underline"
                  >
                    Back to login
                  </button>
                </form>
              </div>
            ) : (
              /* ── Normal login screen ── */
              <div>
                <div className="mb-5 space-y-1 text-center">
                  <h1 className="font-semibold text-2xl tracking-tight">Log In to Your Account</h1>
                  <p className="text-muted-foreground text-sm">Please enter your details to sign in.</p>
                </div>

                {reason === "timeout" && (
                  <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-center text-amber-700 text-xs">
                    You were signed out due to inactivity.
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-3.5">
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="font-medium text-sm">
                      Email Address
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setError("");
                      }}
                      className="h-10 focus-visible:border-primary focus-visible:ring-primary/30"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="password" className="font-medium text-sm">
                      Password
                    </Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          setError("");
                        }}
                        className="h-10 pr-9 focus-visible:border-primary focus-visible:ring-primary/30"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>

                  {error && <p className="text-center text-destructive text-xs">{error}</p>}

                  <Button
                    type="submit"
                    disabled={loading}
                    className="h-11 w-full gap-1.5 font-semibold text-white shadow-lg transition-all hover:opacity-90 active:scale-[0.98]"
                    style={{ backgroundColor: "var(--primary)", boxShadow: "0 4px 24px 0 var(--primary-glow)" }}
                  >
                    {loading ? (
                      <>
                        <Loader2 size={15} className="animate-spin" />
                        Signing in…
                      </>
                    ) : (
                      <>
                        Log in
                        <ArrowRight className="size-4" aria-hidden="true" />
                      </>
                    )}
                  </Button>
                </form>

                <p className="mt-5 text-center text-muted-foreground text-sm lg:hidden">
                  Don&apos;t have an account?{" "}
                  <Link
                    href="https://routelypro.com/register"
                    className="font-medium underline-offset-4 hover:underline"
                    style={{ color: "var(--primary)" }}
                  >
                    Register
                  </Link>
                </p>
              </div>
            )}
          </div>

          <div className="absolute bottom-5 flex w-full justify-center px-6 lg:justify-start">
            <p className="text-muted-foreground text-sm">&copy; 2026, Routely LLC.</p>
          </div>
        </div>

        {/* RIGHT — logistics world (lg+ only) */}
        <div className="order-2 hidden h-full lg:block">
          <LogisticsWorld />
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
