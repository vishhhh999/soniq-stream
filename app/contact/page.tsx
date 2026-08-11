"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import Logo from "@/components/Logo";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, message }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Couldn't send your message. Try again.");
      return;
    }
    setSent(true);
  };

  return (
    <main className="min-h-screen bg-canvas">
      <header className="max-w-md mx-auto px-6 py-8 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo size={20} className="text-primary" />
          <span className="text-sm font-display font-bold text-primary tracking-tight">SONIQ</span>
        </Link>
        <Link href="/" className="text-xs text-secondary hover:text-primary transition-colors">
          Back to home
        </Link>
      </header>

      <div className="max-w-md mx-auto px-6 pb-24">
        <h1 className="text-2xl sm:text-3xl font-display font-bold text-primary tracking-tight mb-2">Contact us</h1>
        <p className="text-sm text-secondary mb-10">
          Bug, question, feedback — whatever it is, this goes to a real person.
        </p>

        {sent ? (
          <div className="flex items-start gap-3 border border-border rounded-lg p-5">
            <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center shrink-0">
              <Check size={15} strokeWidth={2} className="text-on-accent" />
            </div>
            <div>
              <p className="text-sm font-medium text-primary">Sent.</p>
              <p className="text-sm text-secondary mt-1">
                Thanks — we'll get back to you at the email you gave us.
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="text-xs text-tertiary mb-1.5 block">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full bg-surface border border-border rounded-md px-4 py-3 text-sm text-primary focus:border-border-strong outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-tertiary mb-1.5 block">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-surface border border-border rounded-md px-4 py-3 text-sm text-primary focus:border-border-strong outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-tertiary mb-1.5 block">Message</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                rows={6}
                className="w-full bg-surface border border-border rounded-md px-4 py-3 text-sm text-primary focus:border-border-strong outline-none resize-none"
              />
            </div>
            {error && <p className="text-xs text-error">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full bg-accent text-on-accent text-sm font-medium py-3 rounded-full hover:bg-accent-strong transition-colors disabled:opacity-50"
            >
              {busy ? "Sending..." : "Send message"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
