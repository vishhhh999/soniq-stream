# SONIQ — personal WIP music library

Organize, play, and share your own work-in-progress tracks.

## Stack
- Next.js 14 on Vercel
- **Auth.js v5** — email+password (bcrypt-hashed, stored in Postgres) and
  Google sign-in, both real accounts, not an env-var password
- Postgres via Neon, Cloudflare R2 for audio + cover art
- Drizzle ORM, `wavesurfer.js`, client-side BPM estimation, Framer Motion

## Auth — how it actually works now
This isn't open signup. The first time the app runs with an empty `users`
table, visiting it sends you to `/setup` to create the one account. After
that, `/setup` refuses to create another — `/login` is the only way in from
then on, with two options:

- **Email + password** — real account, password hashed with bcrypt, stored
  in your Postgres database. Nothing to configure beyond `AUTH_SECRET`.
- **Google sign-in** — requires a Google Cloud OAuth app (steps below) and
  an `ALLOWED_EMAILS` allowlist. **Deny by default** — if `ALLOWED_EMAILS`
  isn't set, Google sign-in refuses everyone, not "anyone with a Google
  account." This is deliberate: an open Google login on a personal file
  library is a bigger hole than the env-var password it replaced.

### Setting up Google sign-in
1. [console.cloud.google.com](https://console.cloud.google.com) → new project (or reuse one)
2. APIs & Services → OAuth consent screen → External → fill in app name, your email
3. APIs & Services → Credentials → Create Credentials → OAuth client ID → Web application
4. **Authorized redirect URI**: `https://your-app.vercel.app/api/auth/callback/google`
   (and `http://localhost:3000/api/auth/callback/google` if you want it working locally too)
5. Copy the Client ID and Client Secret → `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
6. Set `ALLOWED_EMAILS=your-actual-gmail@gmail.com` (comma-separate for more than one)

If you don't want Google sign-in at all, just leave those three env vars
unset — verified this round: the button still renders, clicking it fails
gracefully to an error page, and the rest of the app (including email+password
login) is completely unaffected.

## Env vars

```
DATABASE_URL=postgres://...
AUTH_SECRET=...                # generate: openssl rand -hex 32
AUTH_TRUST_HOST=true           # needed locally always; keep it set on Vercel too — see note below
GOOGLE_CLIENT_ID=...           # optional — omit to disable Google sign-in
GOOGLE_CLIENT_SECRET=...       # optional
ALLOWED_EMAILS=you@gmail.com   # required if using Google sign-in — comma-separated
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=soniq-tracks
R2_PUBLIC_URL=https://pub-xxxxxxxx.r2.dev
```

`APP_PASSWORD` and `APP_SECRET` from the previous version are gone — Auth.js
replaces that whole system. If they're still set in Vercel, they're just
ignored now, safe to remove whenever.

**On `AUTH_TRUST_HOST`:** Auth.js is supposed to auto-detect Vercel and trust
its host header without this variable, and that's what the docs promise —
but there are unresolved community reports of `UntrustedHost` errors on
Vercel even with it set to Vercel's own auto-detection. Setting it explicitly
is a harmless safety net either way, so it's in the list above for both
environments rather than assumed away.

## What's verified this round (real runs, not just builds)
- Full email+password flow against real Postgres: account creation via
  `/setup`, sign-in through Auth.js's actual callback endpoint, session
  cookie unlocking both pages and API routes, wrong password correctly
  rejected (confirmed no session was granted, not just a status code)
- `/setup` correctly refuses to create a second account once one exists
- Google sign-in confirmed structurally: fails gracefully when unconfigured
  (server survives, login page unaffected), and with credentials present
  builds a fully correct OAuth authorization request (right redirect URI,
  right scopes, PKCE challenge) pointed at Google's real endpoint — the
  handshake itself needs your real Google Cloud app to go further than that
- Duplicate/version detection, share links, and R2 upload path — carried
  over from the previous round, still working (see prior notes for detail)

## What's NOT verified
- The actual Google OAuth callback completing end-to-end — needs a real
  registered app, can't fake that part
- R2 upload itself — same as before, no real bucket to test against here

## Not built yet
- Pitch shift, trim/loop playback gating, folder UI, musical key detection
  — unchanged from previous rounds

## Local setup

```bash
npm install
```

`.env.local` with everything above (Google vars optional), then:

```bash
npm run db:push   # adds the new users table — idempotent, safe to re-run
npm run dev
```

Visit `localhost:3000` — first run sends you to `/setup`.

## Deploying
Same Postgres/R2 setup as before. Add the new `AUTH_SECRET`,
`AUTH_TRUST_HOST`, and (if using Google) the three Google/allowlist vars to
Vercel's Environment Variables. Redeploy, then create your account at
`/setup` on the live URL.

## First-deploy checklist
1. Visit the live URL — should land on `/setup` (empty `users` table)
2. Create your account — should land on `/login` afterward, not still on `/setup`
3. Sign in with email+password — should reach the library
4. If using Google: sign out, try Google sign-in with your allowed email —
   should work; try a different Google account if you want to confirm the
   allowlist actually blocks it
5. Everything from the previous checklist (album creation, version
   detection, share links, ambient background CORS) still applies

## Known deploy pitfalls already hit
- SQLite on Vercel, `prepare: false` for Neon's pooler, Node `crypto` in
  Edge middleware — all from previous rounds, see git history
- **This round:** the login route had no error handling, so a missing
  `AUTH_SECRET` (or `APP_SECRET` under the old system) produced an
  unparseable HTML error page instead of a real error message — fixed, now
  returns clear JSON either way
