"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Logo from "@/components/Logo";

type Step = "email" | "verify" | "username";

export default function SetupPage() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/otp/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Couldn't send code. Try again.");
      setBusy(false);
      return;
    }
    setStep("verify");
    setBusy(false);
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/otp/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Verification failed.");
      setBusy(false);
      return;
    }
    setStep("username");
    setBusy(false);
  };

  const saveUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);

    // Sign in first so we have a session to PATCH against.
    const signInResult = await signIn("credentials", { email, password, redirect: false });
    if (signInResult?.error) {
      setError("Account was created but sign-in failed. Go to login.");
      setBusy(false);
      return;
    }

    const res = await fetch("/api/user/username", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Couldn't save username.");
      setBusy(false);
      return;
    }

    router.push("/");
    router.refresh();
  };

  const skipUsername = async () => {
    setBusy(true);
    const result = await signIn("credentials", { email, password, redirect: false });
    if (result?.error) {
      setError("Sign-in failed. Go to login page.");
      setBusy(false);
      return;
    }
    router.push("/");
    router.refresh();
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-canvas px-6">
      <div className="max-w-xs w-full">
        <Logo size={30} className="text-primary mb-4" />
        <h1 className="text-2xl font-display font-bold text-primary tracking-tight mb-1">SONIQ</h1>

        {step === "email" && (
          <>
            <p className="text-secondary text-sm mb-8">Create an account.</p>
            <form onSubmit={requestCode}>
              <input
                type="email"
                autoFocus
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="w-full bg-surface border border-border rounded-md px-4 py-3 text-sm text-primary focus:border-border-strong outline-none mb-3"
              />
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password (min. 8 characters)"
                className="w-full bg-surface border border-border rounded-md px-4 py-3 text-sm text-primary focus:border-border-strong outline-none mb-3"
              />
              {error && <p className="text-xs text-error mb-3">{error}</p>}
              <button
                type="submit"
                disabled={busy || !email || password.length < 8}
                className="w-full bg-accent text-canvas text-sm font-medium py-3 rounded-md hover:bg-accent-strong transition-colors disabled:opacity-50"
              >
                {busy ? "Sending code..." : "Continue"}
              </button>
            </form>

            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-tertiary">or</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            <button
              type="button"
              onClick={() => signIn("google", { callbackUrl: "/" })}
              className="w-full flex items-center justify-center gap-2 border border-border rounded-md py-3 text-sm text-secondary hover:border-border-strong hover:text-primary transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Continue with Google
            </button>

            <p className="text-center text-xs text-tertiary mt-6">
              Already have an account?{" "}
              <a href="/login" className="text-secondary hover:text-primary underline">Sign in</a>
            </p>
          </>
        )}

        {step === "verify" && (
          <>
            <p className="text-secondary text-sm mb-2">Check your email.</p>
            <p className="text-tertiary text-xs mb-8">
              We sent a 6-digit code to <span className="text-secondary">{email}</span>. It expires in 10 minutes.
            </p>
            <form onSubmit={verifyCode}>
              <input
                type="text"
                autoFocus
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                inputMode="numeric"
                maxLength={6}
                className="w-full bg-surface border border-border rounded-md px-4 py-3 text-sm text-primary focus:border-border-strong outline-none mb-3 tracking-widest text-center font-mono"
              />
              {error && <p className="text-xs text-error mb-3">{error}</p>}
              <button
                type="submit"
                disabled={busy || code.length !== 6}
                className="w-full bg-accent text-canvas text-sm font-medium py-3 rounded-md hover:bg-accent-strong transition-colors disabled:opacity-50"
              >
                {busy ? "Verifying..." : "Verify"}
              </button>
            </form>
            <button
              onClick={() => { setStep("email"); setCode(""); setError(null); }}
              className="w-full text-center text-xs text-tertiary hover:text-secondary mt-4 transition-colors"
            >
              Wrong email? Go back
            </button>
          </>
        )}

        {step === "username" && (
          <>
            <p className="text-secondary text-sm mb-2">One last thing.</p>
            <p className="text-tertiary text-xs mb-8">Pick a username for your profile.</p>
            <form onSubmit={saveUsername}>
              <div className="relative mb-3">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-tertiary text-sm select-none">@</span>
                <input
                  type="text"
                  autoFocus
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                  placeholder="yourname"
                  maxLength={20}
                  className="w-full bg-surface border border-border rounded-md pl-7 pr-4 py-3 text-sm text-primary focus:border-border-strong outline-none"
                />
              </div>
              <p className="text-xs text-tertiary mb-4">3–20 characters, letters, numbers, underscores.</p>
              {error && <p className="text-xs text-error mb-3">{error}</p>}
              <button
                type="submit"
                disabled={busy || username.length < 3}
                className="w-full bg-accent text-canvas text-sm font-medium py-3 rounded-md hover:bg-accent-strong transition-colors disabled:opacity-50 mb-3"
              >
                {busy ? "Saving..." : "Set username"}
              </button>
            </form>
            <button
              onClick={skipUsername}
              disabled={busy}
              className="w-full text-center text-xs text-tertiary hover:text-secondary transition-colors"
            >
              Skip for now
            </button>
          </>
        )}
      </div>
    </main>
  );
}
