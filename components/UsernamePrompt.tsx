"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

// Shown once to any authenticated user who doesn't have a username set.
// Fetches /api/user/me to check — only appears if username is null.
// Skippable (they can set it later from settings when that exists).
export default function UsernamePrompt() {
  const { status } = useSession();
  const [show, setShow] = useState(false);
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/user/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => {
        if (u && !u.username) setShow(true);
      })
      .catch(() => {});
  }, [status]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
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
    setDone(true);
    setTimeout(() => setShow(false), 800);
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 backdrop-ambient-60 z-50 flex items-center justify-center px-6">
      <div className="bg-elevated border border-border rounded-xl p-8 w-full max-w-sm">
        {done ? (
          <div className="text-center">
            <p className="text-primary font-medium">You're all set.</p>
          </div>
        ) : (
          <>
            <h2 className="text-lg font-display font-bold text-primary tracking-tight mb-1">Pick a username</h2>
            <p className="text-secondary text-sm mb-6">
              Used for play stats and future social features. You can change it later.
            </p>

            <form onSubmit={submit}>
              <div className="relative mb-3">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-tertiary text-sm">@</span>
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
              {error && <p className="text-xs text-error mb-3">{error}</p>}

              <button
                type="submit"
                disabled={busy || username.length < 3}
                className="w-full bg-accent text-on-accent text-sm font-medium py-3 rounded-md hover:bg-accent-strong transition-colors disabled:opacity-50 mb-3"
              >
                {busy ? "Saving..." : "Set username"}
              </button>
            </form>

            <button
              onClick={() => setShow(false)}
              className="w-full text-center text-xs text-tertiary hover:text-secondary transition-colors"
            >
              Skip for now
            </button>
          </>
        )}
      </div>
    </div>
  );
}
