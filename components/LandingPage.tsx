"use client";

import Link from "next/link";
import Image from "next/image";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useSession } from "next-auth/react";
import {
  Users, Music2, ShieldCheck,
} from "lucide-react";
import Logo from "./Logo";
import { VinylExportDemo, MixingToolkitDemo, PermissionsDemo, VersionGroupDemo } from "./landing/FeatureDemos";
import { OrganizeIllustration, NotificationsIllustration, AnalyticsIllustration, VaultIllustration } from "./landing/StaticIllustrations";

// The 4 that don't exist on untitled.stream at all (or exist in a much
// thinner form) get the animated spotlight treatment -- these are the
// actual wedge, not just "our favorite features." The other 4 are real
// and worth showing well, but they're parity/polish rather than
// differentiators, so they stay static and smaller.
const ANIMATED_FEATURES = [
  {
    demo: VinylExportDemo,
    title: "Turn a moment into a share",
    body: "Trim any section and export it as a vinyl-style video, ready for stories and socials — spin speed, disc color, and text all yours to set. untitled.stream hands you off to the OS share sheet; this is a real branded export.",
  },
  {
    demo: MixingToolkitDemo,
    title: "A real mixing toolkit, not a toy",
    body: "5-band EQ, stem separation with live mute, varispeed with pitch held constant or linked, a metronome, a tuner. Built into the player, not bolted on.",
  },
  {
    demo: PermissionsDemo,
    title: "Share, then decide who does what",
    body: "Send a link or an invite, and set exactly what people can do — listen, download, or add and edit tracks. Change it any time, per person.",
  },
  {
    demo: VersionGroupDemo,
    title: "Never lose a version",
    body: "Upload a new take of a track and it's grouped with the old ones automatically — every version stays reachable, nothing gets overwritten, no folder work required.",
  },
];

const STATIC_FEATURES = [
  {
    illustration: OrganizeIllustration,
    title: "Organize it your way",
    body: "Group tracks into albums, keep versions of the same idea together, and drag files in from your desktop whenever inspiration hits.",
  },
  {
    illustration: NotificationsIllustration,
    title: "Know when someone listens",
    body: "Get notified when a track's played, a version's added, or someone joins a shared album — no need to check back and wonder.",
  },
  {
    illustration: AnalyticsIllustration,
    title: "See what's landing",
    body: "Play counts by track and by listener, so you know which version people are actually going back to.",
  },
  {
    illustration: VaultIllustration,
    title: "Built for the vault, not the feed",
    body: "Crossfade between tracks, synced lyrics, BPM and key detection — the small things that make going through a session's worth of work feel less like a chore.",
  },
];


export default function LandingPage() {
  // Cursor-reactive parallax for the hero's three-disc fan -- raw pointer
  // position feeds a spring per disc, each with its own stiffness/range, so
  // the back two discs drift less than the front one and the whole stack
  // reads as genuinely layered rather than three flat images moving in
  // lockstep. Deliberately NOT scroll-driven; this is a "the discs are
  // alive" effect, independent of where you are on the page.
  const heroParallaxX = useMotionValue(0);
  const heroParallaxY = useMotionValue(0);
  const springCfg = { stiffness: 60, damping: 14, mass: 0.6 };
  const blackX = useSpring(useTransform(heroParallaxX, (v) => v * 6), springCfg);
  const blackY = useSpring(useTransform(heroParallaxY, (v) => v * 6), springCfg);
  const whiteX = useSpring(useTransform(heroParallaxX, (v) => v * 14), springCfg);
  const whiteY = useSpring(useTransform(heroParallaxY, (v) => v * 14), springCfg);
  const orangeX = useSpring(useTransform(heroParallaxX, (v) => v * 20), springCfg);
  const orangeY = useSpring(useTransform(heroParallaxY, (v) => v * 20), springCfg);

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
      <header className="flex items-center justify-between flex-wrap gap-y-3 max-w-5xl mx-auto px-6 py-6">
        <div className="flex items-center gap-2.5">
          <Logo size={24} className="text-primary" />
          <span className="text-lg font-display font-bold text-primary tracking-tight">SONIQ</span>
        </div>
        <div className="flex items-center gap-3">
          {isAuthed ? (
            <Link
              href="/"
              className="text-sm font-medium bg-accent text-on-accent px-4 py-2 rounded-full hover:bg-accent-strong transition-colors"
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
                className="text-sm font-medium bg-accent text-on-accent px-4 py-2 rounded-full hover:bg-accent-strong transition-colors"
              >
                Get started
              </Link>
            </>
          )}
        </div>
      </header>

      {/* Hero — dark, vinyl-centered treatment matching the Depth Vinyl
          snippet template's own look (same gradient stops, same ambient
          shadow), using the real canonical brand asset instead of a stock
          photo or an illustration. This is the "push the same visual
          direction into the landing page" pass. */}
      <section
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          heroParallaxX.set(((e.clientX - r.left) / r.width - 0.5) * 2);
          heroParallaxY.set(((e.clientY - r.top) / r.height - 0.5) * 2);
        }}
        onMouseLeave={() => { heroParallaxX.set(0); heroParallaxY.set(0); }}
        className="relative overflow-hidden bg-gradient-to-b from-[#1a1a1a] to-[#050505]"
      >
        <div className="max-w-5xl mx-auto px-6 pt-14 sm:pt-20 pb-20 sm:pb-28 text-center relative">
          {/* Three discs, side by side, all equally visible -- no fanning,
              no one hiding the other two. Each spins at its own speed and
              drifts toward the cursor at its own depth, so there's still
              motion and dimensionality, it's just not achieved by stacking
              them on top of each other. Same row on mobile, just smaller,
              rather than a different composition -- keeps "all three
              visible at once" true at every size instead of only on
              desktop. */}
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="relative flex items-center justify-center gap-3 sm:gap-6 mb-10 sm:mb-14"
          >
            <div className="absolute inset-0 rounded-full bg-accent/20 blur-[100px] scale-90" />
            <motion.div
              style={{ x: orangeX, y: orangeY }}
              animate={{ rotate: 360 }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              className="relative w-24 h-24 sm:w-40 sm:h-40 md:w-48 md:h-48 shrink-0"
            >
              <Image src="/brand/vinyl-orange.png" alt="" fill sizes="192px" className="object-contain drop-shadow-[0_16px_30px_rgba(0,0,0,0.45)]" />
            </motion.div>
            <motion.div
              style={{ x: blackX, y: blackY }}
              animate={{ rotate: 360 }}
              transition={{ duration: 14, repeat: Infinity, ease: "linear" }}
              className="relative w-28 h-28 sm:w-48 sm:h-48 md:w-56 md:h-56 shrink-0 z-10"
            >
              <Image
                src="/brand/vinyl-black.png"
                alt=""
                fill
                sizes="224px"
                className="object-contain drop-shadow-[0_20px_40px_rgba(0,0,0,0.5)]"
                priority
              />
            </motion.div>
            <motion.div
              style={{ x: whiteX, y: whiteY }}
              animate={{ rotate: -360 }}
              transition={{ duration: 24, repeat: Infinity, ease: "linear" }}
              className="relative w-24 h-24 sm:w-40 sm:h-40 md:w-48 md:h-48 shrink-0"
            >
              <Image src="/brand/vinyl-white.png" alt="" fill sizes="192px" className="object-contain drop-shadow-[0_16px_30px_rgba(0,0,0,0.45)]" />
            </motion.div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
          >
            {/* The one-liner -- viewport-scaled with clamp() so it reads
                "big" at the same relative weight on a phone as on a 32"
                monitor, instead of jumping between a handful of fixed
                breakpoint sizes. Tight negative tracking at this size is
                what keeps a single-word-per-line moment from feeling
                bloated rather than confident. */}
            <h1
              className="font-display font-medium text-white tracking-[-0.03em] leading-[0.95]"
              style={{ fontSize: "clamp(2.75rem, 9vw, 6.5rem)" }}
            >
              SONIQ
            </h1>
            <p
              className="text-white/60 mx-auto mt-4"
              style={{ fontSize: "clamp(1rem, 2.2vw, 1.375rem)", maxWidth: "38rem" }}
            >
              A private home for the music you're still working on.
            </p>
            <p className="text-white/40 text-sm mt-5 max-w-lg mx-auto leading-relaxed">
              Upload demos, keep every version, and share them with exactly
              who you want — with exactly the permissions you choose. Built
              for work-in-progress, not for streaming to strangers.
            </p>
            <div className="flex items-center justify-center gap-3 mt-9">
              {isAuthed ? (
                <Link
                  href="/"
                  className="text-sm font-medium bg-accent text-on-accent px-6 py-3 rounded-full hover:bg-accent-strong transition-colors"
                >
                  Go to your library
                </Link>
              ) : (
                <>
                  <Link
                    href="/setup"
                    className="text-sm font-medium bg-accent text-on-accent px-6 py-3 rounded-full hover:bg-accent-strong transition-colors"
                  >
                    Create your library
                  </Link>
                  <Link
                    href="/login"
                    className="text-sm font-medium text-white/70 border border-white/20 px-6 py-3 rounded-md hover:border-white/40 hover:text-white transition-colors"
                  >
                    Sign in
                  </Link>
                </>
              )}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Feature grid — animated spotlights first (the actual wedge vs.
          untitled.stream), static illustrated cards after. Both reveal on
          scroll via whileInView, staggered, so the page feels alive as you
          move down it without anything auto-playing off-screen. */}
      <section className="max-w-5xl mx-auto px-6 pb-16 sm:pb-20">
        <div className="grid sm:grid-cols-2 gap-6 sm:gap-8">
          {ANIMATED_FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: (i % 2) * 0.08 }}
              className="border border-border rounded-2xl p-5 sm:p-6 bg-surface/40"
            >
              <f.demo />
              <h3 className="text-primary font-medium mt-5 mb-2">{f.title}</h3>
              <p className="text-secondary text-sm leading-relaxed">{f.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 pb-24 sm:pb-32">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6">
          {STATIC_FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.4, delay: (i % 4) * 0.06 }}
              className="border border-border rounded-2xl p-5"
            >
              <f.illustration />
              <h3 className="text-primary font-medium mt-3 mb-1.5 text-sm">{f.title}</h3>
              <p className="text-tertiary text-xs leading-relaxed">{f.body}</p>
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
          className="inline-block mt-8 text-sm font-medium bg-accent text-on-accent px-6 py-3 rounded-full hover:bg-accent-strong transition-colors"
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
