"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SetupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  // Previously this pre-checked whether an account existed and blocked the
  // form entirely if so ("Sign up only runs once"). Signup is no longer
  // restricted to a single account, so there's nothing to pre-check —
  // any actual restriction (the ALLOWED_EMAILS allowlist, if configured)
  // is enforced server-side on submit and surfaces as a normal form error.
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      router.push("/login?created=1");
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Setup failed.");
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-canvas px-6">
      <form onSubmit={submit} className="max-w-xs w-full">
        <h1 className="text-2xl font-display font-bold text-primary tracking-tight mb-1">SONIQ</h1>
        <p className="text-secondary text-sm mb-8">Create an account.</p>

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
          {busy ? "Creating..." : "Create account"}
        </button>

        <p className="text-center text-xs text-tertiary mt-6">
          Already have an account?{" "}
          <a href="/login" className="text-secondary hover:text-primary underline">
            Sign in
          </a>
        </p>
      </form>
    </main>
  );
}
