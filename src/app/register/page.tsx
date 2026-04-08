"use client";

import { useMemo, useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { useSignUp } from "@clerk/nextjs/legacy";

export default function RegisterPage() {
  const { isLoaded, signUp } = useSignUp();
  const router = useRouter();
  const [form, setForm] = useState({
    fullName: "",
    company: "",
    email: "",
    phone: "",
    password: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signUp) return;
    setError("");
    setLoading(true);

    try {
      // 1. Create Clerk user
      await signUp.create({
        firstName: form.fullName.split(" ")[0],
        lastName: form.fullName.split(" ").slice(1).join(" ") || "",
        emailAddress: form.email,
        password: form.password,
      });

      // 2. Send email verification
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });

      // 3. Create tenant in MongoDB
      await fetch("/api/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: form.company,
          contact_name: form.fullName,
          email: form.email,
          phone: form.phone,
          plan_type: "free_trial",
          clerk_user_id: signUp.createdUserId ?? "",
          status: "pending_verification",
        }),
      });

      setSuccess(true);
    } catch (err: unknown) {
      const clerkErr = err as { errors?: { longMessage?: string }[]; message?: string };
      const msg = clerkErr?.errors?.[0]?.longMessage ?? clerkErr?.message ?? "Something went wrong. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // Password strength
  const strength = useMemo(() => {
    const p = form.password;
    if (!p) return 0;
    let s = 0;
    if (p.length >= 6) s++;
    if (p.length >= 8) s++;
    if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
    if (/\d/.test(p) || /[^A-Za-z0-9]/.test(p)) s++;
    return s;
  }, [form.password]);

  const strengthLabels = ["", "Weak", "Fair", "Good", "Strong"];
  const strengthColors = ["#EF4444", "#F97316", "#EAB308", "#22C55E"];

  // SUCCESS STATE
  if (success) {
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
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <div
            style={{
              width: 64,
              height: 64,
              background: "#DCFCE7",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 24px",
            }}
          >
            <svg
              width="32"
              height="32"
              fill="none"
              stroke="#22C55E"
              strokeWidth="2.5"
              viewBox="0 0 24 24"
              aria-label="Success checkmark"
            >
              <title>Success</title>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2
            style={{
              fontFamily: "var(--font-display), Syne, system-ui",
              fontWeight: 800,
              fontSize: 28,
              color: "#0F172A",
              marginBottom: 8,
            }}
          >
            Check your email!
          </h2>
          <p style={{ fontSize: 15, color: "#64748B", marginBottom: 24, lineHeight: 1.6 }}>
            We sent a verification code to <strong>{form.email}</strong>. Enter the code to activate your Routely
            account.
          </p>
          <button
            type="button"
            onClick={() => router.push("/verify")}
            style={{
              background: "linear-gradient(135deg, #2563EB, #1D4ED8)",
              color: "white",
              border: "none",
              borderRadius: 12,
              padding: "14px 32px",
              fontWeight: 700,
              fontSize: 15,
              cursor: "pointer",
              width: "100%",
            }}
          >
            Enter Verification Code
          </button>
          <p style={{ marginTop: 16, fontSize: 13, color: "#94A3B8" }}>
            Already verified?{" "}
            <Link href="/sign-in" style={{ color: "#2563EB", fontWeight: 600 }}>
              Log in
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "row", minHeight: "100vh", background: "white" }}>
      {/* LEFT PANEL — Brand */}
      <div
        style={{
          display: "none",
          width: "45%",
          background: "linear-gradient(135deg, #1E3A8A 0%, #2563EB 50%, #3B82F6 100%)",
          padding: 48,
          position: "relative",
          overflow: "hidden",
        }}
        className="lg:!flex lg:flex-col lg:justify-between"
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 64 }}>
            <div
              style={{
                width: 40,
                height: 40,
                background: "rgba(255,255,255,0.2)",
                borderRadius: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span style={{ color: "white", fontWeight: 800, fontSize: 20 }}>R</span>
            </div>
            <span style={{ color: "white", fontWeight: 700, fontSize: 22 }}>Routely</span>
          </div>
          <h1 style={{ color: "white", fontSize: 40, fontWeight: 800, lineHeight: 1.2, marginBottom: 16 }}>
            Delivery operations,
            <br />
            simplified.
          </h1>
          <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 16, lineHeight: 1.6, maxWidth: 380 }}>
            Join hundreds of pharmacies and medical practices using Routely to automate their last-mile delivery.
          </p>
        </div>
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>© 2026 Routely LLC. All rights reserved.</div>
      </div>

      {/* RIGHT PANEL — Form */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "48px 24px",
        }}
      >
        <div style={{ width: "100%", maxWidth: 420 }}>
          {/* Mobile logo */}
          <div className="lg:hidden" style={{ textAlign: "center", marginBottom: 32 }}>
            <div
              style={{
                width: 48,
                height: 48,
                background: "#2563EB",
                borderRadius: 12,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 12,
              }}
            >
              <span style={{ color: "white", fontWeight: 800, fontSize: 22 }}>R</span>
            </div>
            <h2 style={{ fontWeight: 700, fontSize: 20, color: "#0F172A" }}>Routely</h2>
          </div>

          <h2
            style={{
              fontFamily: "var(--font-display), Syne, system-ui",
              fontWeight: 800,
              fontSize: 28,
              color: "#0F172A",
              marginBottom: 4,
            }}
          >
            Create your account
          </h2>
          <p style={{ fontSize: 15, color: "#64748B", marginBottom: 28 }}>
            Start your 14-day free trial. No card required.
          </p>

          <form onSubmit={handleSubmit}>
            {/* Full Name */}
            <div style={{ marginBottom: 16 }}>
              <label
                htmlFor="reg-name"
                style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}
              >
                Full Name
              </label>
              <input
                id="reg-name"
                type="text"
                required
                value={form.fullName}
                onChange={(e) => set("fullName", e.target.value)}
                placeholder="John Doe"
                style={{
                  width: "100%",
                  height: 44,
                  border: "1.5px solid #E2E8F0",
                  borderRadius: 10,
                  padding: "0 14px",
                  fontSize: 14,
                  color: "#0F172A",
                  outline: "none",
                  boxSizing: "border-box",
                  transition: "border-color 0.2s",
                }}
              />
            </div>

            {/* Company */}
            <div style={{ marginBottom: 16 }}>
              <label
                htmlFor="reg-company"
                style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}
              >
                Company / Practice Name
              </label>
              <input
                id="reg-company"
                type="text"
                value={form.company}
                onChange={(e) => set("company", e.target.value)}
                placeholder="Acme Pharmacy"
                style={{
                  width: "100%",
                  height: 44,
                  border: "1.5px solid #E2E8F0",
                  borderRadius: 10,
                  padding: "0 14px",
                  fontSize: 14,
                  color: "#0F172A",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Email */}
            <div style={{ marginBottom: 16 }}>
              <label
                htmlFor="reg-email"
                style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}
              >
                Email Address
              </label>
              <input
                id="reg-email"
                type="email"
                required
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="you@company.com"
                style={{
                  width: "100%",
                  height: 44,
                  border: "1.5px solid #E2E8F0",
                  borderRadius: 10,
                  padding: "0 14px",
                  fontSize: 14,
                  color: "#0F172A",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Phone */}
            <div style={{ marginBottom: 16 }}>
              <label
                htmlFor="reg-phone"
                style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}
              >
                Phone Number
              </label>
              <input
                id="reg-phone"
                type="tel"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="(555) 123-4567"
                style={{
                  width: "100%",
                  height: 44,
                  border: "1.5px solid #E2E8F0",
                  borderRadius: 10,
                  padding: "0 14px",
                  fontSize: 14,
                  color: "#0F172A",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Password */}
            <div style={{ marginBottom: 8 }}>
              <label
                htmlFor="reg-password"
                style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}
              >
                Password
              </label>
              <div style={{ position: "relative" }}>
                <input
                  id="reg-password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  value={form.password}
                  onChange={(e) => set("password", e.target.value)}
                  placeholder="Min 8 characters"
                  style={{
                    width: "100%",
                    height: 44,
                    border: "1.5px solid #E2E8F0",
                    borderRadius: 10,
                    padding: "0 44px 0 14px",
                    fontSize: 14,
                    color: "#0F172A",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  style={{
                    position: "absolute",
                    right: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "#94A3B8",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {/* Password Strength */}
            {form.password.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      style={{
                        flex: 1,
                        height: 4,
                        borderRadius: 2,
                        background: i < strength ? strengthColors[strength - 1] : "#E2E8F0",
                        transition: "background 0.3s",
                      }}
                    />
                  ))}
                </div>
                <span style={{ fontSize: 12, color: strength > 0 ? strengthColors[strength - 1] : "#94A3B8" }}>
                  {strengthLabels[strength]}
                </span>
              </div>
            )}

            {/* Error */}
            {error && (
              <div
                style={{
                  background: "#FEF2F2",
                  border: "1px solid #FCA5A5",
                  borderRadius: 10,
                  padding: "10px 14px",
                  marginBottom: 16,
                  color: "#DC2626",
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !isLoaded}
              style={{
                width: "100%",
                height: 48,
                background: loading ? "#93C5FD" : "linear-gradient(135deg, #2563EB, #1D4ED8)",
                color: "white",
                border: "none",
                borderRadius: 12,
                fontWeight: 700,
                fontSize: 15,
                cursor: loading ? "not-allowed" : "pointer",
                transition: "all 0.2s",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              {loading ? (
                <>
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    style={{ animation: "spin 1s linear infinite" }}
                    aria-label="Loading"
                  >
                    <title>Loading</title>
                    <path d="M21 12a9 9 0 11-6.219-8.56" />
                  </svg>
                  Creating account...
                </>
              ) : (
                "Create Account"
              )}
            </button>
          </form>

          <p style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: "#64748B" }}>
            Already have an account?{" "}
            <Link href="/sign-in" style={{ color: "#2563EB", fontWeight: 600, textDecoration: "none" }}>
              Log in
            </Link>
          </p>

          <p style={{ textAlign: "center", marginTop: 12, fontSize: 11, color: "#CBD5E1", lineHeight: 1.5 }}>
            By creating an account you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
      </div>

      {/* Spinner animation */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
