import LegalPageShell from "@/components/LegalPageShell";

export const metadata = { title: "Privacy Policy — SONIQ" };

export default function PrivacyPage() {
  return (
    <LegalPageShell title="Privacy Policy" updated="August 9, 2026">
      <p>
        This describes what SONIQ collects, why, and who it's shared with.
        Written in plain language on purpose — if anything here is unclear,
        the <a href="/contact" className="text-primary underline">Contact page</a> reaches a real person.
      </p>

      <section>
        <h2 className="text-primary font-medium text-base mb-2">What we collect</h2>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>Your email address, and a password hash if you sign up that way (never the password itself)</li>
          <li>An optional username and profile picture, if you set them</li>
          <li>The audio files, cover art, titles, artist names, notes, and lyrics you upload</li>
          <li>Album, folder, and organizational data — what's grouped with what</li>
          <li>Who you've shared albums or tracks with, and what permissions you gave them</li>
          <li>Play events (which track, roughly when, and whether it was you or an anonymous listener via a share link) — used to show you play counts and insights</li>
          <li>Basic account activity needed to keep the service working — sign-in timestamps, session tokens</li>
        </ul>
      </section>

      <section>
        <h2 className="text-primary font-medium text-base mb-2">What we don't do</h2>
        <p>
          No analytics or tracking scripts. No advertising, and no selling
          or renting your data to anyone. We don't scan or listen to your
          audio for any purpose beyond what you explicitly trigger (like
          BPM/key detection, which runs in your own browser, not on a
          server).
        </p>
      </section>

      <section>
        <h2 className="text-primary font-medium text-base mb-2">Who we share it with</h2>
        <p>
          Only the infrastructure providers needed to run the service, and
          only what each one needs to do its job:
        </p>
        <ul className="list-disc pl-5 space-y-1.5 mt-2">
          <li><strong className="text-primary font-normal">Neon</strong> — hosts our database (your account, track metadata, sharing relationships)</li>
          <li><strong className="text-primary font-normal">Cloudflare R2</strong> — stores your uploaded audio files, cover art, and avatars</li>
          <li><strong className="text-primary font-normal">Google</strong> — if you choose Google sign-in, they handle that authentication; we only receive your email and profile info back</li>
          <li><strong className="text-primary font-normal">Resend</strong> — sends verification codes and, if you use it, contact-form replies</li>
          <li><strong className="text-primary font-normal">Vercel</strong> — hosts and runs the application itself</li>
        </ul>
        <p className="mt-3">
          None of these providers use your data for their own purposes —
          they're processing it on our behalf to run the service.
        </p>
      </section>

      <section>
        <h2 className="text-primary font-medium text-base mb-2">Sharing between users</h2>
        <p>
          If you share an album — via a public link, invite link, or by
          inviting someone directly — the people you share with can see
          whatever your chosen access level allows (listening, and
          optionally downloading or editing). If someone saves your shared
          album into their own library, that's a real, separate copy under
          their account from that point on.
        </p>
      </section>

      <section>
        <h2 className="text-primary font-medium text-base mb-2">How long we keep it</h2>
        <p>
          For as long as your account exists. Deleting a track or album
          removes the file from storage along with its database record.
          Deleting your account removes your personal data; content you'd
          shared that other people already saved into their own libraries
          stays with them, since it's a separate copy at that point.
        </p>
      </section>

      <section>
        <h2 className="text-primary font-medium text-base mb-2">Your choices</h2>
        <p>
          You can update or remove your profile info, delete individual
          tracks or albums, revoke a share or invite link, or delete your
          account entirely, all from within the app. Reach out via the{" "}
          <a href="/contact" className="text-primary underline">Contact page</a> if you'd rather we handle a request directly.
        </p>
      </section>

      <section>
        <h2 className="text-primary font-medium text-base mb-2">Cookies</h2>
        <p>
          Covered separately in the{" "}
          <a href="/cookies" className="text-primary underline">Cookie Policy</a> — short version: one
          essential sign-in cookie, nothing else.
        </p>
      </section>

      <section>
        <h2 className="text-primary font-medium text-base mb-2">Changes</h2>
        <p>
          If this policy changes in a meaningful way, we'll update the date
          at the top of this page.
        </p>
      </section>
    </LegalPageShell>
  );
}
