"use client";

import { useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { useSignUp } from "@clerk/nextjs/legacy";

export default function VerifyPage() {
  const { isLoaded, signUp, setActive } = useSignUp();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signUp) return;
    setLoading(true);
    setError("");

    try {
      const result = await signUp.attemptEmailAddressVerification({ code });

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.push("/dashboard/default");
      } else {
        setError("Verification incomplete. Please try again.");
      }
    } catch (err: unknown) {
      const clerkErr = err as { errors?: { longMessage?: string }[]; message?: string };
      setError(clerkErr?.errors?.[0]?.longMessage ?? "Invalid code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "white",
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 400, width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div
            style={{
              width: 48,
              height: 48,
              background: "#2563EB",
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px",
            }}
          >
            <span style={{ color: "white", fontWeight: 800, fontSize: 22 }}>R</span>
          </div>
          <h1
            style={{
              fontFamily: "var(--font-display), Syne, system-ui",
              fontWeight: 800,
              fontSize: 28,
              color: "#0F172A",
              marginBottom: 8,
            }}
          >
            Verify your email
          </h1>
          <p style={{ fontSize: 15, color: "#64748B" }}>Enter the 6-digit code we sent to your email</p>
        </div>

        <form onSubmit={handleVerify}>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            maxLength={6}
            style={{
              width: "100%",
              height: 64,
              textAlign: "center",
              fontSize: 32,
              fontWeight: 700,
              letterSpacing: "0.3em",
              border: "2px solid #E2E8F0",
              borderRadius: 12,
              outline: "none",
              color: "#0F172A",
              marginBottom: 16,
              boxSizing: "border-box",
            }}
          />

          {error && (
            <p style={{ color: "#EF4444", fontSize: 13, fontWeight: 500, marginBottom: 12, textAlign: "center" }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || code.length < 6}
            style={{
              width: "100%",
              height: 52,
              background: code.length === 6 ? "linear-gradient(135deg, #2563EB, #1D4ED8)" : "#E2E8F0",
              color: code.length === 6 ? "white" : "#94A3B8",
              border: "none",
              borderRadius: 12,
              fontWeight: 700,
              fontSize: 16,
              cursor: code.length === 6 ? "pointer" : "not-allowed",
              transition: "all 0.2s",
            }}
          >
            {loading ? "Verifying..." : "Verify Email"}
          </button>
        </form>

        <p style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: "#64748B" }}>
          Already have an account?{" "}
          <Link href="/sign-in" style={{ color: "#2563EB", fontWeight: 600 }}>
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
