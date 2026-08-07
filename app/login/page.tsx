"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

export default function LoginPage() {
  const [checking, setChecking] = useState(true);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/setup")
      .then((r) => {
        if (!r.ok) throw new Error(`Server returned ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (d.needsSetup) router.push("/setup");
        else setChecking(false);
      })
      .catch((e) => {
        // Previously: this had no .catch(), so any failure here (e.g. the
        // `users` table not existing in production yet) left `checking`
        // stuck at true forever, and the component just returned null —
        // a permanently blank page with no indication anything was wrong.
        console.error("Setup check failed:", e);
        setCheckError(
          "Couldn't reach the server. This usually means the database schema is out of date — check DATABASE_URL and that `npm run db:push` has been run against production."
        );
        setChecking(false);
      });
  }, [router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await signIn("credentials", { email, password, redirect: false });
    if (res?.error) {
      setError("Wrong email or password.");
      setBusy(false);
    } else {
      router.push("/");
      router.refresh();
    }
  };

  if (checking) return null;

  if (checkError) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-canvas px-6">
        <div className="max-w-sm w-full text-center">
          <h1 className="text-2xl font-display font-bold text-primary tracking-tight mb-4">SONIQ</h1>
          <p className="text-sm text-error">{checkError}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-canvas px-6">
      <div className="max-w-xs w-full">
        <h1 className="text-2xl font-display font-bold text-primary tracking-tight mb-1">SONIQ</h1>
        <p className="text-secondary text-sm mb-8">Your library, locked to you.</p>

        <form onSubmit={submit}>
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
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full bg-surface border border-border rounded-md px-4 py-3 text-sm text-primary focus:border-border-strong outline-none mb-3"
          />

          {error && <p className="text-xs text-error mb-3">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full bg-accent text-canvas text-sm font-medium py-3 rounded-md hover:bg-accent-strong transition-colors disabled:opacity-50"
          >
            {busy ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-tertiary">or</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <button
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
      </div>
    </main>
  );
}
