"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function SetupPage() {
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/setup")
      .then((r) => r.json())
      .then((d) => {
        if (!d.needsSetup) {
          router.push("/login");
        } else {
          setChecking(false);
        }
      });
  }, [router]);

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

  if (checking) return null;

  return (
    <main className="min-h-screen flex items-center justify-center bg-canvas px-6">
      <form onSubmit={submit} className="max-w-xs w-full">
        <h1 className="text-2xl font-display font-bold text-primary tracking-tight mb-1">SONIQ</h1>
        <p className="text-secondary text-sm mb-8">Create your account — this only happens once.</p>

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
      </form>
    </main>
  );
}
