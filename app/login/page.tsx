"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Login failed.");
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-canvas px-6">
      <form onSubmit={submit} className="max-w-xs w-full">
        <h1 className="text-2xl font-display font-bold text-primary tracking-tight mb-1">SONIQ</h1>
        <p className="text-secondary text-sm mb-8">Your library, locked to you.</p>

        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full bg-surface border border-border rounded-md px-4 py-3 text-sm text-primary focus:border-border-strong outline-none mb-3"
        />

        {error && <p className="text-xs text-error mb-3">{error}</p>}

        <button
          type="submit"
          disabled={busy || !password}
          className="w-full bg-accent text-canvas text-sm font-medium py-3 rounded-md hover:bg-accent-strong transition-colors disabled:opacity-50"
        >
          {busy ? "Checking..." : "Enter"}
        </button>
      </form>
    </main>
  );
}
