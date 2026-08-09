import LegalPageShell from "@/components/LegalPageShell";

export const metadata = { title: "Terms of Service — SONIQ" };

export default function TermsPage() {
  return (
    <LegalPageShell title="Terms of Service" updated="August 9, 2026">
      <p>
        These terms cover your use of SONIQ (soniq.lol), a personal library
        for organizing, sharing, and listening to work-in-progress music.
        By creating an account or using the service, you agree to them.
      </p>

      <section>
        <h2 className="text-primary font-medium text-base mb-2">Your account</h2>
        <p>
          You need an account to upload or organize music. You're
          responsible for keeping your login credentials secure and for
          anything that happens under your account. If you sign up with
          email and password, we store a bcrypt hash of your password —
          never the password itself. If you sign in with Google, we don't
          see or store your Google password at all.
        </p>
      </section>

      <section>
        <h2 className="text-primary font-medium text-base mb-2">Your content</h2>
        <p>
          You keep ownership of everything you upload — tracks, cover art,
          lyrics, notes. We don't claim any rights to it beyond what's
          needed to store it and show it back to you (and to anyone you
          choose to share it with). You're responsible for having the
          rights to upload whatever you upload, and for what you do with
          content someone else has shared with you.
        </p>
        <p className="mt-3">
          When you save a copy of someone else's shared album into your own
          library, you're getting a real copy stored under your account.
          That doesn't change who owns the underlying music — it's on you
          to respect whatever the original owner intended when they shared
          it with you.
        </p>
      </section>

      <section>
        <h2 className="text-primary font-medium text-base mb-2">Sharing and permissions</h2>
        <p>
          Albums can be private, invite-only, or shared via a link,
          depending on what you choose. You control whether people you
          share with can only listen, or also download or edit. Anyone you
          give access to can see whatever that permission level allows —
          it's on you to set it correctly for what you actually intend to
          share.
        </p>
      </section>

      <section>
        <h2 className="text-primary font-medium text-base mb-2">Acceptable use</h2>
        <p>
          Don't upload anything you don't have the right to upload, don't
          use the service to distribute copyrighted material you don't own
          or have permission to share, and don't try to break, abuse, or
          gain unauthorized access to the service or other people's
          accounts.
        </p>
      </section>

      <section>
        <h2 className="text-primary font-medium text-base mb-2">Deleting your content</h2>
        <p>
          Deleting a track or album removes it and its underlying file from
          storage. If you delete an album you own that you'd previously
          shared, the copies already saved into other people's libraries
          aren't automatically deleted — they're separate copies at that
          point, stored under those accounts.
        </p>
      </section>

      <section>
        <h2 className="text-primary font-medium text-base mb-2">No warranty</h2>
        <p>
          SONIQ is provided as-is. We try to keep it reliable and your
          files safe, but we can't guarantee the service will always be
          available or error-free. Keep your own backups of anything you
          can't afford to lose.
        </p>
      </section>

      <section>
        <h2 className="text-primary font-medium text-base mb-2">Changes</h2>
        <p>
          We may update these terms as the product changes. Continuing to
          use SONIQ after an update means you accept the revised terms.
        </p>
      </section>

      <section>
        <h2 className="text-primary font-medium text-base mb-2">Contact</h2>
        <p>
          Questions about these terms — reach out through the{" "}
          <a href="/contact" className="text-primary underline">Contact page</a>.
        </p>
      </section>
    </LegalPageShell>
  );
}
