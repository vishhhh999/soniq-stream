"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useSession } from "next-auth/react";
import {
  FolderOpen, Share2, GitBranch, Bell, Users, BarChart3, Sparkles, Music2, ShieldCheck,
} from "lucide-react";
import Logo from "./Logo";

const FEATURES = [
  {
    icon: FolderOpen,
    title: "Organize it your way",
    body: "Group tracks into albums, keep versions of the same idea together, and drag files in from your desktop whenever inspiration hits.",
  },
  {
    icon: GitBranch,
    title: "Never lose a version",
    body: "Upload a new take of a track and it's grouped with the old ones automatically — every version stays reachable, nothing gets overwritten.",
  },
  {
    icon: Share2,
    title: "Share, then decide who does what",
    body: "Send a link or an invite, and set exactly what people can do — listen, download, or add and edit tracks. Change it any time.",
  },
  {
    icon: Bell,
    title: "Know when someone listens",
    body: "Get notified when a track's played, a version's added, or someone joins a shared album — no need to check back and wonder.",
  },
  {
    icon: BarChart3,
    title: "See what's landing",
    body: "Play counts by track and by listener, so you know which version people are actually going back to.",
  },
  {
    icon: Sparkles,
    title: "Built for the vault, not the feed",
    body: "Crossfade between tracks, synced lyrics, BPM and key detection — the small things that make going through a session's worth of work feel less like a chore.",
  },
];

export default function LandingPage() {
  // Previously this component only ever rendered for logged-out visitors
  // (app/page.tsx redirected anyone signed in straight to the library), so
  // every CTA on the page unconditionally pointed at sign-in/sign-up. Now
  // it's also reachable at /about while signed in (see that route, and the
  // "About SONIQ" link in Settings) — so the CTAs need to reflect that
  // instead of asking an already-signed-in person to sign in again.
  const { status } = useSession();
  const isAuthed = status === "authenticated";
  return (
    <main className="min-h-screen bg-canvas overflow-x-hidden">
      {/* Nav */}
      <header className="flex items-center justify-between max-w-5xl mx-auto px-6 py-6">
        <div className="flex items-center gap-2.5">
          <Logo size={24} className="text-primary" />
          <span className="text-lg font-display font-bold text-primary tracking-tight">SONIQ</span>
        </div>
        <div className="flex items-center gap-3">
          {isAuthed ? (
            <Link
              href="/"
              className="text-sm font-medium bg-accent text-canvas px-4 py-2 rounded-md hover:bg-accent-strong transition-colors"
            >
              Go to your library
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm text-secondary hover:text-primary transition-colors px-3 py-2"
              >
                Sign in
              </Link>
              <Link
                href="/setup"
                className="text-sm font-medium bg-accent text-canvas px-4 py-2 rounded-md hover:bg-accent-strong transition-colors"
              >
                Get started
              </Link>
            </>
          )}
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-3xl mx-auto px-6 pt-16 sm:pt-24 pb-20 sm:pb-28 text-center">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <p className="text-xs uppercase tracking-widest text-tertiary mb-4">
            Music organization &amp; sharing software for unreleased tracks
          </p>
          <h1 className="text-4xl sm:text-6xl font-display font-bold text-primary tracking-tight leading-[1.05]">
            SONIQ is a private home for the music you're still working on.
          </h1>
          <p className="text-secondary text-base sm:text-lg mt-6 max-w-xl mx-auto leading-relaxed">
            SONIQ is a personal library for organizing, sharing, and
            listening to work-in-progress music. Upload demos, keep every
            version, and share them with exactly who you want — with
            exactly the permissions you choose. Built for work-in-progress,
            not for streaming to strangers.
          </p>
          <div className="flex items-center justify-center gap-3 mt-9">
            {isAuthed ? (
              <Link
                href="/"
                className="text-sm font-medium bg-accent text-canvas px-6 py-3 rounded-md hover:bg-accent-strong transition-colors"
              >
                Go to your library
              </Link>
            ) : (
              <>
                <Link
                  href="/setup"
                  className="text-sm font-medium bg-accent text-canvas px-6 py-3 rounded-md hover:bg-accent-strong transition-colors"
                >
                  Create your library
                </Link>
                <Link
                  href="/login"
                  className="text-sm font-medium text-secondary border border-border px-6 py-3 rounded-md hover:border-border-strong hover:text-primary transition-colors"
                >
                  Sign in
                </Link>
              </>
            )}
          </div>
        </motion.div>
      </section>

      {/* Feature grid */}
      <section className="max-w-5xl mx-auto px-6 pb-24 sm:pb-32">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.4, delay: (i % 3) * 0.06 }}
              className="border border-border rounded-xl p-6"
            >
              <f.icon size={20} strokeWidth={1.5} className="text-accent mb-4" />
              <h3 className="text-primary font-medium mb-2">{f.title}</h3>
              <p className="text-secondary text-sm leading-relaxed">{f.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Data use — explains what account data is requested and why, a
          distinct requirement from "what does the app do" per Google's
          OAuth homepage guidelines (support.google.com/cloud/answer/13807376):
          "explain with transparency the purpose for which your app requests
          user data." Previously nowhere on the page. */}
      <section className="border-t border-border">
        <div className="max-w-2xl mx-auto px-6 py-16 sm:py-20">
          <div className="flex items-start gap-4">
            <ShieldCheck size={22} strokeWidth={1.5} className="text-accent shrink-0 mt-0.5" />
            <div>
              <h2 className="text-primary font-medium text-lg mb-2">
                What SONIQ asks for, and why
              </h2>
              <p className="text-secondary text-sm leading-relaxed">
                You can create a SONIQ account with an email and password, or
                by signing in with Google. If you use Google sign-in, we
                only request your <strong className="text-primary font-normal">name, email address, and profile photo</strong> —
                just enough to create your account and identify you inside
                the app. We don't request access to your Gmail, Google
                Drive, contacts, or any other Google data, and we never post
                or send anything on your behalf. Full details are in our{" "}
                <Link href="/privacy" className="text-primary underline">Privacy Policy</Link>.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Collaboration callout */}
      <section className="border-t border-border">
        <div className="max-w-3xl mx-auto px-6 py-20 sm:py-28 text-center">
          <Users size={28} strokeWidth={1.2} className="text-accent mx-auto mb-6" />
          <h2 className="text-2xl sm:text-3xl font-display font-bold text-primary tracking-tight">
            Made for working with people, not broadcasting to everyone.
          </h2>
          <p className="text-secondary text-base mt-4 max-w-lg mx-auto leading-relaxed">
            Invite a collaborator with a link, set what they can do, and see
            who's actually got access at a glance. Revoke it whenever you want.
          </p>
        </div>
      </section>

      {/* Pricing */}
      <section className="border-t border-border">
        <div className="max-w-3xl mx-auto px-6 py-20 sm:py-28">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-display font-bold text-primary tracking-tight">
              Simple pricing.
            </h2>
            <p className="text-secondary text-base mt-3 max-w-md mx-auto">
              Start free. Upgrade when your library outgrows it.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="border border-border rounded-xl p-6">
              <p className="text-xs uppercase tracking-wide text-tertiary mb-2">Free</p>
              <p className="text-3xl font-display font-bold text-primary">$0</p>
              <p className="text-sm text-secondary mt-3 leading-relaxed">
                500MB of storage — everything else in SONIQ, no feature limits.
                Enough to get a real feel for it.
              </p>
            </div>
            <div className="border border-accent rounded-xl p-6 relative">
              <p className="text-xs uppercase tracking-wide text-accent mb-2">Pro</p>
              <p className="text-3xl font-display font-bold text-primary">
                $5<span className="text-base font-normal text-secondary">/mo</span>
              </p>
              <p className="text-sm text-secondary mt-3 leading-relaxed">
                Unlimited storage. Or $40/year instead — that's 4 months free
                compared to paying monthly.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="max-w-3xl mx-auto px-6 py-20 sm:py-28 text-center">
        <Music2 size={28} strokeWidth={1.2} className="text-accent mx-auto mb-6" />
        <h2 className="text-2xl sm:text-3xl font-display font-bold text-primary tracking-tight">
          Your vault's waiting.
        </h2>
        <Link
          href={isAuthed ? "/" : "/setup"}
          className="inline-block mt-8 text-sm font-medium bg-accent text-canvas px-6 py-3 rounded-md hover:bg-accent-strong transition-colors"
        >
          {isAuthed ? "Go to your library" : "Create your library"}
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="max-w-5xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Logo size={16} className="text-tertiary" />
            <span className="text-xs text-tertiary">SONIQ</span>
          </div>
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-tertiary">
            <Link href="/terms" className="hover:text-secondary transition-colors">Terms</Link>
            <Link href="/privacy" className="hover:text-secondary transition-colors">Privacy</Link>
            <Link href="/cookies" className="hover:text-secondary transition-colors">Cookie Policy</Link>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent("soniq:open-cookie-settings"))}
              className="hover:text-secondary transition-colors"
            >
              Cookie Settings
            </button>
            <Link href="/contact" className="hover:text-secondary transition-colors">Contact Us</Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}
