"use client";

import LegalPageShell from "@/components/LegalPageShell";

export default function CookiesPage() {
  return (
    <LegalPageShell title="Cookie Policy" updated="August 9, 2026">
      <p>
        This is short because SONIQ's actual cookie use is short. No
        analytics, no advertising, no third-party trackers — anywhere.
      </p>

      <section>
        <h2 className="text-primary font-medium text-base mb-2">The one cookie we set</h2>
        <p>
          A session cookie from our authentication system (NextAuth), used
          purely to keep you signed in between visits. It's HTTP-only
          (JavaScript can't read it) and strictly necessary — the service
          doesn't work without it, so there's nothing to opt out of here.
        </p>
      </section>

      <section>
        <h2 className="text-primary font-medium text-base mb-2">What isn't a cookie, but is similar</h2>
        <p>
          A few preferences — light/dark theme, whether the ambient
          background is on, your crossfade duration — are saved in your
          browser's local storage, not a cookie. They never leave your
          device and aren't sent to any server. Clearing your browser's
          site data for soniq.lol resets these back to defaults.
        </p>
      </section>

      <section>
        <h2 className="text-primary font-medium text-base mb-2">What we don't use</h2>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>No analytics cookies (no Google Analytics, no Mixpanel, nothing tracking your usage)</li>
          <li>No advertising or retargeting cookies</li>
          <li>No third-party embeds that set their own cookies</li>
        </ul>
      </section>

      <section>
        <h2 className="text-primary font-medium text-base mb-2">Managing this</h2>
        <p>
          Since the only cookie we set is required for sign-in, there's no
          meaningful toggle to offer — turning it off means you can't stay
          logged in. You can still clear it any time through your
          browser's own cookie settings, which will just sign you out.
        </p>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("soniq:open-cookie-settings"))}
          className="text-primary underline text-sm mt-3"
        >
          Open cookie settings
        </button>
      </section>
    </LegalPageShell>
  );
}
