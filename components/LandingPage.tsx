"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  FolderOpen, Share2, GitBranch, Bell, Users, BarChart3, Sparkles, Music2,
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
  return (
    <main className="min-h-screen bg-canvas overflow-x-hidden">
      {/* Nav */}
      <header className="flex items-center justify-between max-w-5xl mx-auto px-6 py-6">
        <div className="flex items-center gap-2.5">
          <Logo size={24} className="text-primary" />
          <span className="text-lg font-display font-bold text-primary tracking-tight">SONIQ</span>
        </div>
        <div className="flex items-center gap-3">
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
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-3xl mx-auto px-6 pt-16 sm:pt-24 pb-20 sm:pb-28 text-center">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-4xl sm:text-6xl font-display font-bold text-primary tracking-tight leading-[1.05]">
            A private home for the music you're still working on.
          </h1>
          <p className="text-secondary text-base sm:text-lg mt-6 max-w-xl mx-auto leading-relaxed">
            Upload demos, keep every version, and share them with exactly who
            you want — with exactly the permissions you choose. Built for
            work-in-progress, not for streaming to strangers.
          </p>
          <div className="flex items-center justify-center gap-3 mt-9">
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

      {/* Final CTA */}
      <section className="max-w-3xl mx-auto px-6 py-20 sm:py-28 text-center">
        <Music2 size={28} strokeWidth={1.2} className="text-accent mx-auto mb-6" />
        <h2 className="text-2xl sm:text-3xl font-display font-bold text-primary tracking-tight">
          Your vault's waiting.
        </h2>
        <Link
          href="/setup"
          className="inline-block mt-8 text-sm font-medium bg-accent text-canvas px-6 py-3 rounded-md hover:bg-accent-strong transition-colors"
        >
          Create your library
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
